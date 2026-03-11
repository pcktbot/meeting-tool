import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { eq, desc, like, or } from "drizzle-orm";

export function registerMeetingTools(server: McpServer) {
  server.tool(
    "list_meetings",
    "List all meetings ordered by most recent",
    { limit: z.number().optional().default(50) },
    async ({ limit }) => {
      const meetings = await db
        .select()
        .from(schema.meetings)
        .orderBy(desc(schema.meetings.createdAt))
        .limit(limit);

      return {
        content: [
          { type: "text", text: JSON.stringify(meetings, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "get_meeting",
    "Get a meeting with all its details (audio files, transcriptions, summaries, highlights)",
    { id: z.string().describe("Meeting ID") },
    async ({ id }) => {
      const [meeting] = await db
        .select()
        .from(schema.meetings)
        .where(eq(schema.meetings.id, id));

      if (!meeting) {
        return {
          content: [{ type: "text", text: "Meeting not found" }],
          isError: true,
        };
      }

      const [audioFiles, transcriptions, summaries, highlights] =
        await Promise.all([
          db
            .select()
            .from(schema.audioFiles)
            .where(eq(schema.audioFiles.meetingId, id)),
          db
            .select()
            .from(schema.transcriptions)
            .where(eq(schema.transcriptions.meetingId, id)),
          db
            .select()
            .from(schema.summaries)
            .where(eq(schema.summaries.meetingId, id)),
          db
            .select()
            .from(schema.highlights)
            .where(eq(schema.highlights.meetingId, id)),
        ]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { meeting, audioFiles, transcriptions, summaries, highlights },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "create_meeting",
    "Create a new meeting",
    { title: z.string().optional().default("Untitled Meeting") },
    async ({ title }) => {
      const [meeting] = await db
        .insert(schema.meetings)
        .values({ title })
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(meeting, null, 2) }],
      };
    },
  );

  server.tool(
    "update_meeting_title",
    "Update a meeting's title",
    {
      id: z.string().describe("Meeting ID"),
      title: z.string().describe("New title"),
    },
    async ({ id, title }) => {
      await db
        .update(schema.meetings)
        .set({ title, updatedAt: new Date() })
        .where(eq(schema.meetings.id, id));

      return {
        content: [{ type: "text", text: `Updated meeting title to "${title}"` }],
      };
    },
  );

  server.tool(
    "delete_meeting",
    "Delete a meeting and all associated data (cascades)",
    { id: z.string().describe("Meeting ID") },
    async ({ id }) => {
      await db.delete(schema.meetings).where(eq(schema.meetings.id, id));

      return {
        content: [{ type: "text", text: `Deleted meeting ${id}` }],
      };
    },
  );

  server.tool(
    "save_transcription",
    "Save a transcription for a meeting",
    {
      meetingId: z.string().describe("Meeting ID"),
      audioFileId: z.string().describe("Audio file ID"),
      content: z.string().describe("Transcription text content"),
      modelUsed: z.string().describe("Model that produced the transcription"),
    },
    async ({ meetingId, audioFileId, content, modelUsed }) => {
      const [transcription] = await db
        .insert(schema.transcriptions)
        .values({ meetingId, audioFileId, content, modelUsed })
        .returning();

      return {
        content: [
          { type: "text", text: JSON.stringify(transcription, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "update_transcription",
    "Update an existing transcription's content",
    {
      id: z.string().describe("Transcription ID"),
      content: z.string().describe("New transcription content"),
      contentFormat: z
        .string()
        .optional()
        .default("plain")
        .describe("Content format: 'plain' or 'tiptap_json'"),
    },
    async ({ id, content, contentFormat }) => {
      await db
        .update(schema.transcriptions)
        .set({ content, contentFormat })
        .where(eq(schema.transcriptions.id, id));

      return {
        content: [{ type: "text", text: `Updated transcription ${id}` }],
      };
    },
  );

  server.tool(
    "search_content",
    "Search across meeting transcriptions and summaries by text",
    { query: z.string().describe("Search text") },
    async ({ query }) => {
      const pattern = `%${query}%`;

      const transcriptionResults = await db
        .select({
          meetingId: schema.transcriptions.meetingId,
          type: schema.transcriptions.contentFormat,
          content: schema.transcriptions.content,
          meetingTitle: schema.meetings.title,
        })
        .from(schema.transcriptions)
        .innerJoin(
          schema.meetings,
          eq(schema.transcriptions.meetingId, schema.meetings.id),
        )
        .where(like(schema.transcriptions.content, pattern));

      const summaryResults = await db
        .select({
          meetingId: schema.summaries.meetingId,
          type: schema.summaries.contentFormat,
          content: schema.summaries.content,
          meetingTitle: schema.meetings.title,
        })
        .from(schema.summaries)
        .innerJoin(
          schema.meetings,
          eq(schema.summaries.meetingId, schema.meetings.id),
        )
        .where(like(schema.summaries.content, pattern));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                transcriptions: transcriptionResults,
                summaries: summaryResults,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
