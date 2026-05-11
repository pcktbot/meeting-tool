import type { JSONContent } from "@tiptap/react";

function parseTipTapDoc(rawContent: string): JSONContent | null {
  try {
    const parsed = JSON.parse(rawContent) as JSONContent;
    if (parsed?.type === "doc" && Array.isArray(parsed.content)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function flattenTipTapText(node: JSONContent | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map((child) => flattenTipTapText(child)).join("");
}

function tryParseEmbeddedDoc(text: string): JSONContent | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{"type":"doc"')) {
    return null;
  }

  for (const candidate of [trimmed, `${trimmed}]}`]) {
    try {
      const parsed = JSON.parse(candidate) as JSONContent;
      if (parsed?.type === "doc" && Array.isArray(parsed.content)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function unwrapEmbeddedTipTapDoc(doc: JSONContent): JSONContent {
  const flattened = flattenTipTapText(doc);
  const embeddedDoc = tryParseEmbeddedDoc(flattened);
  return embeddedDoc ?? doc;
}

function parseInlineMarkdown(text: string): JSONContent[] {
  const content: JSONContent[] = [];
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
        marks: [{ type: "bold" }],
      });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      content.push({
        type: "text",
        text: token.slice(1, -1),
        marks: [{ type: "italic" }],
      });
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

export function plainTextToTipTapDoc(text: string): JSONContent {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.trim() }],
    })),
  };
}

export function cleanupTextToTipTapDoc(text: string): JSONContent {
  const lines = text.split("\n");
  const content: JSONContent[] = [];
  let currentListItems: JSONContent[] = [];

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
        attrs: { level: 2 },
        content: parseInlineMarkdown(line.slice(3).trim()),
      });
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

export function markdownLikeToTipTapDoc(text: string): JSONContent {
  const lines = text.split("\n");
  const content: JSONContent[] = [];
  let currentListItems: JSONContent[] = [];

  function flushList() {
    if (currentListItems.length > 0) {
      content.push({ type: "bulletList", content: currentListItems });
      currentListItems = [];
    }
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushList();
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: line.slice(3) }],
      });
    } else if (line.startsWith("- ")) {
      currentListItems.push({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: line.slice(2) }],
          },
        ],
      });
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: line }],
      });
    }
  }

  flushList();

  if (content.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return { type: "doc", content };
}

function normalizeTextNode(node: JSONContent): JSONContent[] {
  if (node.type !== "text" || typeof node.text !== "string") {
    return [node];
  }

  if (node.marks?.length) {
    return [node];
  }

  if (!/(\*\*[^*]+\*\*|\*[^*]+\*)/.test(node.text)) {
    return [node];
  }

  return parseInlineMarkdown(node.text);
}

function normalizeTipTapNode(node: JSONContent): JSONContent {
  if (!node.content) {
    const [normalizedLeaf] = normalizeTextNode(node);
    return normalizedLeaf;
  }

  const normalizedContent = node.content.flatMap((child) => {
    if (child.type === "text") {
      return normalizeTextNode(child);
    }

    return [normalizeTipTapNode(child)];
  });

  return {
    ...node,
    content: normalizedContent,
  };
}

function normalizeTipTapDoc(doc: JSONContent): JSONContent {
  if (doc.type !== "doc" || !doc.content) {
    return doc;
  }

  return {
    ...doc,
    content: doc.content.map((node) => normalizeTipTapNode(node)),
  };
}

export function loadTipTapContent(
  rawContent: string,
  contentFormat: string,
  section: "transcription" | "summary" | "todo" | "entry",
): JSONContent {
  const parsedDoc = parseTipTapDoc(rawContent);

  if (contentFormat === "tiptap_json" || parsedDoc) {
    if (parsedDoc) {
      return normalizeTipTapDoc(unwrapEmbeddedTipTapDoc(parsedDoc));
    }
    return plainTextToTipTapDoc(rawContent);
  }

  if (section === "summary" || section === "todo") {
    return markdownLikeToTipTapDoc(rawContent);
  }

  return plainTextToTipTapDoc(rawContent);
}

export function tipTapDocToPlainText(content: JSONContent | null): string {
  if (!content) return "";

  if (content.type === "text") {
    return content.text || "";
  }

  const parts = (content.content || []).map((child) => tipTapDocToPlainText(child));
  const joined = parts.join(content.type === "paragraph" ? "" : "\n").trim();

  if (content.type === "paragraph" || content.type === "heading") {
    return joined;
  }

  if (content.type === "bulletList") {
    return (content.content || [])
      .map((child) => `- ${tipTapDocToPlainText(child).trim()}`)
      .join("\n");
  }

  if (content.type === "listItem") {
    return parts.join(" ").trim();
  }

  if (content.type === "doc") {
    return parts.filter(Boolean).join("\n\n");
  }

  return joined;
}

export function extractPlainText(
  rawContent: string,
  contentFormat: string,
): string {
  const parsedDoc = parseTipTapDoc(rawContent);

  if (contentFormat !== "tiptap_json" && !parsedDoc) {
    return rawContent;
  }

  try {
    return tipTapDocToPlainText(
      unwrapEmbeddedTipTapDoc(parsedDoc ?? JSON.parse(rawContent)),
    );
  } catch {
    return rawContent;
  }
}
