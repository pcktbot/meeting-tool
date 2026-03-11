import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "../db.ts";
import { eq } from "drizzle-orm";

const MEETING_SUMMARY_PROMPT = `You are a meeting summarization assistant. Given the following meeting transcription, produce a structured summary with these sections:

## Key Points
- List the main topics discussed and decisions made

## Action Items
- List any action items, tasks, or follow-ups mentioned, with assignees if stated

## Summary
A concise 2-3 paragraph summary of the meeting content.

## Participants
List any participants mentioned by name.

Transcription:
`;

async function getApiKey(providedKey?: string): Promise<string | null> {
  if (providedKey) return providedKey;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  // Try reading from settings table
  const [setting] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "anthropic_api_key"));

  return setting?.value ?? null;
}

export function registerSummarizationTools(server: McpServer) {
  server.tool(
    "save_summary",
    "Save a pre-generated summary for a meeting",
    {
      meetingId: z.string().describe("Meeting ID"),
      transcriptionId: z.string().describe("Transcription ID this summarizes"),
      content: z.string().describe("Summary content"),
      modelUsed: z.string().describe("Model that generated the summary"),
      promptUsed: z
        .string()
        .optional()
        .default("custom")
        .describe("Prompt identifier"),
    },
    async ({ meetingId, transcriptionId, content, modelUsed, promptUsed }) => {
      const [summary] = await db
        .insert(schema.summaries)
        .values({ meetingId, transcriptionId, content, modelUsed, promptUsed })
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.tool(
    "summarize_meeting",
    "Generate an AI summary from a meeting's transcription using Claude",
    {
      meetingId: z.string().describe("Meeting ID to summarize"),
      apiKey: z
        .string()
        .optional()
        .describe(
          "Anthropic API key (falls back to ANTHROPIC_API_KEY env var or app settings)",
        ),
      model: z
        .string()
        .optional()
        .default("claude-sonnet-4-20250514")
        .describe("Claude model to use"),
    },
    async ({ meetingId, apiKey, model }) => {
      // Get transcription
      const [transcription] = await db
        .select()
        .from(schema.transcriptions)
        .where(eq(schema.transcriptions.meetingId, meetingId));

      if (!transcription) {
        return {
          content: [
            {
              type: "text",
              text: "No transcription found for this meeting. Transcribe it first.",
            },
          ],
          isError: true,
        };
      }

      const key = await getApiKey(apiKey);
      if (!key) {
        return {
          content: [
            {
              type: "text",
              text: "No Anthropic API key available. Provide one via the apiKey parameter, ANTHROPIC_API_KEY env var, or configure it in the app settings.",
            },
          ],
          isError: true,
        };
      }

      const anthropic = new Anthropic({ apiKey: key });
      const message = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: MEETING_SUMMARY_PROMPT + transcription.content,
          },
        ],
      });

      const textBlock = message.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return {
          content: [
            { type: "text", text: "No text content in Claude response" },
          ],
          isError: true,
        };
      }

      const summaryText = textBlock.text;

      // Save to database
      const [summary] = await db
        .insert(schema.summaries)
        .values({
          meetingId,
          transcriptionId: transcription.id,
          content: summaryText,
          contentFormat: "plain",
          modelUsed: model,
          promptUsed: "meeting_summary_v1",
        })
        .returning();

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
        ],
      };
    },
  );
}
