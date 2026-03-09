import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { eq, desc } from "drizzle-orm";

export function registerHighlightTools(server: McpServer) {
  server.tool(
    "list_highlights",
    "List highlights, optionally filtered by meeting ID",
    { meetingId: z.string().optional().describe("Filter by meeting ID") },
    async ({ meetingId }) => {
      if (meetingId) {
        const highlights = await db
          .select()
          .from(schema.highlights)
          .where(eq(schema.highlights.meetingId, meetingId))
          .orderBy(desc(schema.highlights.createdAt));

        return {
          content: [
            { type: "text", text: JSON.stringify(highlights, null, 2) },
          ],
        };
      }

      // All highlights with meeting titles
      const highlights = await db
        .select({
          id: schema.highlights.id,
          meetingId: schema.highlights.meetingId,
          section: schema.highlights.section,
          sourceId: schema.highlights.sourceId,
          color: schema.highlights.color,
          textContent: schema.highlights.textContent,
          fromPos: schema.highlights.fromPos,
          toPos: schema.highlights.toPos,
          createdAt: schema.highlights.createdAt,
          meetingTitle: schema.meetings.title,
        })
        .from(schema.highlights)
        .innerJoin(
          schema.meetings,
          eq(schema.highlights.meetingId, schema.meetings.id),
        )
        .orderBy(desc(schema.highlights.createdAt));

      return {
        content: [
          { type: "text", text: JSON.stringify(highlights, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "create_highlight",
    "Create a new highlight for a meeting",
    {
      meetingId: z.string().describe("Meeting ID"),
      section: z
        .enum(["transcription", "summary"])
        .describe("Which section this highlight is from"),
      sourceId: z
        .string()
        .describe("ID of the transcription or summary"),
      color: z.string().describe("Highlight color (e.g. '#ffeb3b')"),
      textContent: z.string().describe("The highlighted text"),
      fromPos: z.number().describe("Start position in the document"),
      toPos: z.number().describe("End position in the document"),
    },
    async ({ meetingId, section, sourceId, color, textContent, fromPos, toPos }) => {
      const [highlight] = await db
        .insert(schema.highlights)
        .values({ meetingId, section, sourceId, color, textContent, fromPos, toPos })
        .returning();

      return {
        content: [
          { type: "text", text: JSON.stringify(highlight, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "delete_highlight",
    "Delete a highlight by ID",
    { id: z.string().describe("Highlight ID") },
    async ({ id }) => {
      await db.delete(schema.highlights).where(eq(schema.highlights.id, id));

      return {
        content: [{ type: "text", text: `Deleted highlight ${id}` }],
      };
    },
  );
}
