import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, schema } from "../db.ts";
import { eq, desc } from "drizzle-orm";

export function registerMeetingResources(server: McpServer) {
  // List all meetings
  server.resource(
    "meetings-list",
    "meeting://list",
    "List of all meetings with metadata",
    async (uri) => {
      const meetings = await db
        .select()
        .from(schema.meetings)
        .orderBy(desc(schema.meetings.createdAt));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(meetings, null, 2),
          },
        ],
      };
    },
  );

  // Individual meeting with full details
  server.resource(
    "meeting",
    new ResourceTemplate("meeting:///{id}", { list: undefined }),
    "A specific meeting with all its details",
    async (uri, { id }) => {
      const meetingId = id as string;
      const [meeting] = await db
        .select()
        .from(schema.meetings)
        .where(eq(schema.meetings.id, meetingId));

      if (!meeting) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: "Meeting not found",
            },
          ],
        };
      }

      const [audioFiles, transcriptions, summaries, highlights] =
        await Promise.all([
          db
            .select()
            .from(schema.audioFiles)
            .where(eq(schema.audioFiles.meetingId, meetingId)),
          db
            .select()
            .from(schema.transcriptions)
            .where(eq(schema.transcriptions.meetingId, meetingId)),
          db
            .select()
            .from(schema.summaries)
            .where(eq(schema.summaries.meetingId, meetingId)),
          db
            .select()
            .from(schema.highlights)
            .where(eq(schema.highlights.meetingId, meetingId)),
        ]);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
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
}
