import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { eq, desc, and, gte, lte } from "drizzle-orm";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function registerContributionTools(server: McpServer) {
  // --- Entries ---

  server.tool(
    "create_contribution_entry",
    "Create a new daily contribution entry",
    {
      content: z.string().describe("The contribution text"),
      entryDate: z
        .string()
        .optional()
        .describe("Date in YYYY-MM-DD format. Defaults to today."),
      contentFormat: z
        .enum(["plain", "tiptap_json"])
        .optional()
        .default("plain")
        .describe("Content format: 'plain' or 'tiptap_json'"),
    },
    async ({ content, entryDate, contentFormat }) => {
      const [entry] = await db
        .insert(schema.contributionEntries)
        .values({ content, contentFormat: contentFormat ?? "plain", entryDate: entryDate ?? todayDate() })
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );

  server.tool(
    "update_contribution_entry",
    "Update the content of an existing contribution entry",
    {
      id: z.string().describe("Entry ID"),
      content: z.string().describe("Updated contribution text"),
      contentFormat: z
        .enum(["plain", "tiptap_json"])
        .optional()
        .describe("Content format: 'plain' or 'tiptap_json'"),
    },
    async ({ id, content, contentFormat }) => {
      const updates: Record<string, unknown> = { content, updatedAt: new Date() };
      if (contentFormat !== undefined) updates.contentFormat = contentFormat;
      const [entry] = await db
        .update(schema.contributionEntries)
        .set(updates)
        .where(eq(schema.contributionEntries.id, id))
        .returning();

      if (!entry) {
        return {
          content: [{ type: "text", text: `Entry ${id} not found` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );

  server.tool(
    "list_contribution_entries",
    "List contribution entries, optionally filtered by date or date range",
    {
      date: z
        .string()
        .optional()
        .describe("Single date filter (YYYY-MM-DD)"),
      dateFrom: z
        .string()
        .optional()
        .describe("Range start date (YYYY-MM-DD), inclusive"),
      dateTo: z
        .string()
        .optional()
        .describe("Range end date (YYYY-MM-DD), inclusive"),
    },
    async ({ date, dateFrom, dateTo }) => {
      let entries;

      if (date) {
        entries = await db
          .select()
          .from(schema.contributionEntries)
          .where(eq(schema.contributionEntries.entryDate, date))
          .orderBy(desc(schema.contributionEntries.createdAt));
      } else if (dateFrom && dateTo) {
        entries = await db
          .select()
          .from(schema.contributionEntries)
          .where(
            and(
              gte(schema.contributionEntries.entryDate, dateFrom),
              lte(schema.contributionEntries.entryDate, dateTo),
            ),
          )
          .orderBy(
            desc(schema.contributionEntries.entryDate),
            desc(schema.contributionEntries.createdAt),
          );
      } else {
        entries = await db
          .select()
          .from(schema.contributionEntries)
          .orderBy(
            desc(schema.contributionEntries.entryDate),
            desc(schema.contributionEntries.createdAt),
          );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(entries, null, 2) }],
      };
    },
  );

  // --- Summaries ---

  server.tool(
    "create_contribution_summary",
    "Create a summary of contribution entries over a date range",
    {
      content: z.string().describe("The summary narrative text"),
      dateFrom: z
        .string()
        .describe("Start date of summarized range (YYYY-MM-DD)"),
      dateTo: z
        .string()
        .describe("End date of summarized range (YYYY-MM-DD)"),
      entryIds: z
        .array(z.string())
        .describe("IDs of the contribution entries this summary covers"),
    },
    async ({ content, dateFrom, dateTo, entryIds }) => {
      const [summary] = await db
        .insert(schema.contributionSummaries)
        .values({
          content,
          dateFrom,
          dateTo,
          entryIds: JSON.stringify(entryIds),
        })
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.tool(
    "update_contribution_summary",
    "Update the content of a contribution summary",
    {
      id: z.string().describe("Summary ID"),
      content: z.string().describe("Updated summary text"),
    },
    async ({ id, content }) => {
      const [summary] = await db
        .update(schema.contributionSummaries)
        .set({ content, updatedAt: new Date() })
        .where(eq(schema.contributionSummaries.id, id))
        .returning();

      if (!summary) {
        return {
          content: [{ type: "text", text: `Summary ${id} not found` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
  );

  server.tool(
    "list_contribution_summaries",
    "List contribution summaries, optionally filtered by date range",
    {
      dateFrom: z
        .string()
        .optional()
        .describe("Range start date (YYYY-MM-DD)"),
      dateTo: z
        .string()
        .optional()
        .describe("Range end date (YYYY-MM-DD)"),
    },
    async ({ dateFrom, dateTo }) => {
      let summaries;

      if (dateFrom && dateTo) {
        summaries = await db
          .select()
          .from(schema.contributionSummaries)
          .where(
            and(
              lte(schema.contributionSummaries.dateFrom, dateTo),
              gte(schema.contributionSummaries.dateTo, dateFrom),
            ),
          )
          .orderBy(desc(schema.contributionSummaries.createdAt));
      } else {
        summaries = await db
          .select()
          .from(schema.contributionSummaries)
          .orderBy(desc(schema.contributionSummaries.createdAt));
      }

      return {
        content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
      };
    },
  );
}
