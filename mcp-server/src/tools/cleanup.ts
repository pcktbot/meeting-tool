import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "../db.ts";
import { eq } from "drizzle-orm";

type TiptapNode = {
  type: string;
  content?: TiptapNode[];
  text?: string;
};

type TiptapDoc = {
  type: "doc";
  content: TiptapNode[];
};

function parseInlineMarkdown(text: string): TiptapNode[] {
  const content: TiptapNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      content.push({
        type: "text",
        text: text.slice(lastIndex, start),
      });
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      content.push({
        type: "text",
        text: token.slice(2, -2),
        // TipTap JSON mark structure
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        marks: [{ type: "bold" }] as any,
      } as TiptapNode);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      content.push({
        type: "text",
        text: token.slice(1, -1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        marks: [{ type: "italic" }] as any,
      } as TiptapNode);
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) {
    content.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return content.length > 0 ? content : [{ type: "text", text }];
}

const TRANSCRIPT_CLEANUP_PROMPT = `You are editing a raw meeting or work diary transcript for readability.

Rules:
- Preserve meaning.
- Do not summarize.
- Do not remove important details.
- Remove spoken formatting commands like "paragraph break" or "new paragraph".
- Improve punctuation and paragraph breaks.
- Keep uncertain or messy wording if the meaning is unclear rather than inventing details.
- Return only the cleaned transcript text.

Transcript:
`;

function parseTiptapDoc(content: string): TiptapDoc | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { type?: unknown }).type !== "doc" ||
      !Array.isArray((parsed as { content?: unknown }).content)
    ) {
      return null;
    }
    return parsed as TiptapDoc;
  } catch {
    return null;
  }
}

function tiptapNodeToPlainText(node: TiptapNode): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  const parts = (node.content ?? []).map(tiptapNodeToPlainText);

  if (node.type === "paragraph" || node.type === "heading") {
    return parts.join("");
  }

  if (node.type === "listItem") {
    return parts.join(" ").trim();
  }

  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((child) => `- ${tiptapNodeToPlainText(child).trim()}`)
      .join("\n");
  }

  if (node.type === "doc") {
    return parts.filter(Boolean).join("\n\n");
  }

  return parts.join("\n").trim();
}

export function extractPlainText(content: string, contentFormat: string): string {
  if (contentFormat !== "tiptap_json") {
    return content;
  }

  const doc = parseTiptapDoc(content);
  if (!doc) {
    return content;
  }

  return tiptapNodeToPlainText(doc);
}

export function plainTextToTipTapDoc(text: string): TiptapDoc {
  const lines = text.split("\n");
  const content: TiptapNode[] = [];
  let currentListItems: TiptapNode[] = [];

  function flushList() {
    if (currentListItems.length > 0) {
      content.push({ type: "bulletList", content: currentListItems });
      currentListItems = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushList();
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      content.push({
        type: "heading",
        content: parseInlineMarkdown(line.slice(3).trim()),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attrs: { level: 2 } as any,
      } as TiptapNode);
      continue;
    }

    if (line.startsWith("- ")) {
      currentListItems.push({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(line.slice(2).trim()),
          },
        ],
      });
      continue;
    }

    flushList();
    content.push({
      type: "paragraph",
      content: parseInlineMarkdown(line.trim()),
    });
  }

  flushList();

  if (content.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return { type: "doc", content };
}

export async function getApiKey(providedKey?: string): Promise<string | null> {
  if (providedKey) return providedKey;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const [setting] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "anthropic_api_key"));

  return setting?.value ?? null;
}

export async function getCleanupStylePrompt(): Promise<string> {
  const [setting] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "claude_cleanup_style_prompt"));

  return setting?.value ?? "";
}

// Fallback when no model is set in app Settings. Keep in sync with
// DEFAULT_CLAUDE_MODEL in src/services/settings.ts (separate runtimes).
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

// Resolve the Claude model: an explicit argument wins, otherwise the user's
// saved "claude_model" setting, otherwise the built-in default.
export async function getClaudeModel(providedModel?: string): Promise<string> {
  if (providedModel) return providedModel;

  const [setting] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "claude_model"));

  return setting?.value || DEFAULT_CLAUDE_MODEL;
}

export async function cleanContentWithClaude({
  content,
  contentFormat,
  apiKey,
  model,
  stylePrompt,
}: {
  content: string;
  contentFormat: string;
  apiKey?: string;
  model: string;
  stylePrompt?: string;
}): Promise<{
  plainText: string;
  jsonContent: string;
  effectiveStylePrompt: string;
}> {
  const key = await getApiKey(apiKey);
  if (!key) {
    throw new Error(
      "No Anthropic API key available. Provide one via the apiKey parameter, ANTHROPIC_API_KEY env var, or configure it in the app settings.",
    );
  }

  const effectiveStylePrompt =
    stylePrompt !== undefined ? stylePrompt : await getCleanupStylePrompt();
  const systemPrompt = effectiveStylePrompt.trim()
    ? `Apply these style preferences while cleaning the transcript:\n${effectiveStylePrompt.trim()}`
    : undefined;

  const anthropic = new Anthropic({ apiKey: key });
  const plainTextInput = extractPlainText(content, contentFormat);
  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: TRANSCRIPT_CLEANUP_PROMPT + plainTextInput,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  const plainText = textBlock.text.trim();
  const jsonContent = JSON.stringify(plainTextToTipTapDoc(plainText));

  return { plainText, jsonContent, effectiveStylePrompt };
}
