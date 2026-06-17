import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "../db.ts";
import { eq } from "drizzle-orm";
import {
  cleanContentWithClaude,
  getApiKey,
  getClaudeModel,
  getCleanupStylePrompt,
} from "./cleanup.ts";

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

export function registerSummarizationTools(server: McpServer) {
  server.tool(
    "get_cleanup_preferences",
    "Read the saved Claude cleanup style preferences and API key availability from app settings",
    {},
    async () => {
      const [stylePrompt, apiKey] = await Promise.all([
        getCleanupStylePrompt(),
        getApiKey(),
      ]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                cleanupStylePrompt: stylePrompt,
                hasAnthropicApiKey: Boolean(apiKey),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

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
        .describe("Claude model override. Defaults to the saved claude_model setting, else claude-sonnet-4-6."),
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

      const resolvedModel = await getClaudeModel(model);
      const anthropic = new Anthropic({ apiKey: key });
      const message = await anthropic.messages.create({
        model: resolvedModel,
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
          modelUsed: resolvedModel,
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

  server.tool(
    "clean_meeting_transcription",
    "Clean a meeting transcription with Claude and save the result as tiptap_json",
    {
      transcriptionId: z
        .string()
        .optional()
        .describe("Transcription ID to clean. Provide either transcriptionId or meetingId."),
      meetingId: z
        .string()
        .optional()
        .describe("Meeting ID whose transcription should be cleaned. Provide either transcriptionId or meetingId."),
      apiKey: z
        .string()
        .optional()
        .describe("Anthropic API key override"),
      model: z
        .string()
        .optional()
        .describe("Claude model override. Defaults to the saved claude_model setting, else claude-sonnet-4-6."),
      stylePrompt: z
        .string()
        .optional()
        .describe("Optional style prompt override. Defaults to saved cleanup preferences."),
    },
    async ({ transcriptionId, meetingId, apiKey, model, stylePrompt }) => {
      const byTranscription = Boolean(transcriptionId);
      const byMeeting = Boolean(meetingId);
      if (byTranscription === byMeeting) {
        return {
          content: [
            {
              type: "text",
              text: "Provide exactly one target selector: transcriptionId or meetingId.",
            },
          ],
          isError: true,
        };
      }

      const transcriptionRows = byTranscription
        ? await db
            .select()
            .from(schema.transcriptions)
            .where(eq(schema.transcriptions.id, transcriptionId!))
        : await db
            .select()
            .from(schema.transcriptions)
            .where(eq(schema.transcriptions.meetingId, meetingId!));

      const transcription = transcriptionRows[0];

      if (!transcription) {
        return {
          content: [{ type: "text", text: "Transcription not found" }],
          isError: true,
        };
      }

      try {
        const cleaned = await cleanContentWithClaude({
          content: transcription.content,
          contentFormat: transcription.contentFormat ?? "plain",
          apiKey,
          model: await getClaudeModel(model),
          stylePrompt,
        });

        const [updated] = await db
          .update(schema.transcriptions)
          .set({
            content: cleaned.jsonContent,
            contentFormat: "tiptap_json",
          })
          .where(eq(schema.transcriptions.id, transcription.id))
          .returning();

        await db
          .delete(schema.highlights)
          .where(eq(schema.highlights.sourceId, transcription.id));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  transcriptionId: updated.id,
                  meetingId: updated.meetingId,
                  model,
                  cleanupStylePrompt: cleaned.effectiveStylePrompt,
                  plainText: cleaned.plainText,
                  contentFormat: updated.contentFormat,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
