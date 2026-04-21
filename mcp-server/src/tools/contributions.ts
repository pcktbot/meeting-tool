import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { eq, desc, and, gte, lte, isNotNull } from "drizzle-orm";
import { cleanContentWithClaude } from "./cleanup.ts";

type TiptapNode = {
  type: string;
  content?: TiptapNode[];
  text?: string;
};

type TiptapDoc = {
  type: "doc";
  content: TiptapNode[];
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createBulletListItem(text: string): TiptapNode {
  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function createBulletListFromPlainContent(existingContent: string, textToAppend: string): TiptapDoc {
  const items: TiptapNode[] = [];
  const trimmedExisting = existingContent.trim();
  if (trimmedExisting.length > 0) {
    items.push(createBulletListItem(trimmedExisting));
  }
  items.push(createBulletListItem(textToAppend));

  return {
    type: "doc",
    content: [{ type: "bulletList", content: items }],
  };
}

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

function appendToTiptapBulletList(content: string, textToAppend: string): string | null {
  const doc = parseTiptapDoc(content);
  if (!doc) {
    return null;
  }

  const existingBulletList = doc.content.find(
    (node) => node.type === "bulletList" && Array.isArray(node.content),
  );

  if (existingBulletList?.content) {
    existingBulletList.content.push(createBulletListItem(textToAppend));
  } else {
    doc.content.push({
      type: "bulletList",
      content: [createBulletListItem(textToAppend)],
    });
  }

  return JSON.stringify(doc);
}

export function registerContributionTools(server: McpServer) {
  // --- Entries ---

  server.tool(
    "clean_contribution_entry",
    "Clean a contribution entry with Claude and save the result as tiptap_json. Can target an entry by id or by date, and can prefer entries created from recordings.",
    {
      id: z
        .string()
        .optional()
        .describe("Entry ID. Provide either id or date."),
      date: z
        .string()
        .optional()
        .describe("Entry date (YYYY-MM-DD). Provide either id or date."),
      recordedOnly: z
        .boolean()
        .optional()
        .default(true)
        .describe("When targeting by date, only consider entries with attached audio by default."),
      apiKey: z
        .string()
        .optional()
        .describe("Anthropic API key override"),
      model: z
        .string()
        .optional()
        .default("claude-sonnet-4-20250514")
        .describe("Claude model to use"),
      stylePrompt: z
        .string()
        .optional()
        .describe("Optional style prompt override. Defaults to saved cleanup preferences."),
    },
    async ({ id, date, recordedOnly, apiKey, model, stylePrompt }) => {
      const byId = Boolean(id);
      const byDate = Boolean(date);
      if (byId === byDate) {
        return {
          content: [{ type: "text", text: "Provide exactly one target selector: id or date." }],
          isError: true,
        };
      }

      let entry;
      if (id) {
        const [result] = await db
          .select()
          .from(schema.contributionEntries)
          .where(eq(schema.contributionEntries.id, id));
        entry = result;
      } else {
        const whereClause = recordedOnly
          ? and(
              eq(schema.contributionEntries.entryDate, date!),
              isNotNull(schema.contributionEntries.audioFilePath),
            )
          : eq(schema.contributionEntries.entryDate, date!);

        const entries = await db
          .select()
          .from(schema.contributionEntries)
          .where(whereClause)
          .orderBy(desc(schema.contributionEntries.createdAt));

        if (entries.length > 1) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    message: `Found ${entries.length} candidate entries for ${date}. Use id to target one explicitly.`,
                    entryIds: entries.map((candidate) => candidate.id),
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
        [entry] = entries;
      }

      if (!entry) {
        return {
          content: [{ type: "text", text: id ? `Entry ${id} not found` : `No matching entry found for date ${date}` }],
          isError: true,
        };
      }

      try {
        const cleaned = await cleanContentWithClaude({
          content: entry.content,
          contentFormat: entry.contentFormat ?? "plain",
          apiKey,
          model,
          stylePrompt,
        });

        const [updatedEntry] = await db
          .update(schema.contributionEntries)
          .set({
            content: cleaned.jsonContent,
            contentFormat: "tiptap_json",
            updatedAt: new Date(),
          })
          .where(eq(schema.contributionEntries.id, entry.id))
          .returning();

        await db
          .delete(schema.contributionHighlights)
          .where(eq(schema.contributionHighlights.contributionEntryId, entry.id));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  entryId: updatedEntry.id,
                  entryDate: updatedEntry.entryDate,
                  model,
                  cleanupStylePrompt: cleaned.effectiveStylePrompt,
                  plainText: cleaned.plainText,
                  contentFormat: updatedEntry.contentFormat,
                  hadAudio: Boolean(updatedEntry.audioFilePath),
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

  server.tool(
    "append_contribution_entry_item",
    "Append text to a contribution entry as a bullet item",
    {
      id: z
        .string()
        .optional()
        .describe("Entry ID. Provide either id or date."),
      date: z
        .string()
        .optional()
        .describe("Entry date (YYYY-MM-DD). Provide either id or date."),
      text: z.string().describe("Text to append"),
      asBullet: z
        .boolean()
        .optional()
        .default(true)
        .describe("Append as bullet item (default true)."),
    },
    async ({ id, date, text, asBullet }) => {
      const byId = Boolean(id);
      const byDate = Boolean(date);
      if (byId === byDate) {
        return {
          content: [{ type: "text", text: "Provide exactly one target selector: id or date." }],
          isError: true,
        };
      }

      let entry;
      if (id) {
        const [result] = await db
          .select()
          .from(schema.contributionEntries)
          .where(eq(schema.contributionEntries.id, id));
        entry = result;
      } else {
        const entries = await db
          .select()
          .from(schema.contributionEntries)
          .where(eq(schema.contributionEntries.entryDate, date!))
          .orderBy(desc(schema.contributionEntries.createdAt));

        if (entries.length > 1) {
          return {
            content: [{
              type: "text",
              text: `Found ${entries.length} entries for date ${date}. Use id to target a specific entry.`,
            }],
            isError: true,
          };
        }
        [entry] = entries;
      }

      if (!entry) {
        return {
          content: [{ type: "text", text: id ? `Entry ${id} not found` : `No entry found for date ${date}` }],
          isError: true,
        };
      }

      const appendAsBullet = asBullet ?? true;
      let updatedContent: string;
      let updatedContentFormat: "plain" | "tiptap_json";

      if (appendAsBullet) {
        if (entry.contentFormat === "plain") {
          updatedContent = JSON.stringify(
            createBulletListFromPlainContent(entry.content, text),
          );
          updatedContentFormat = "tiptap_json";
        } else {
          const nextContent = appendToTiptapBulletList(entry.content, text);
          if (!nextContent) {
            return {
              content: [{ type: "text", text: `Entry ${entry.id} has invalid tiptap_json content.` }],
              isError: true,
            };
          }
          updatedContent = nextContent;
          updatedContentFormat = "tiptap_json";
        }
      } else {
        if (entry.contentFormat === "tiptap_json") {
          return {
            content: [{
              type: "text",
              text: "Appending plain text is only supported for entries with contentFormat='plain'.",
            }],
            isError: true,
          };
        }
        const prefix = entry.content.length > 0 ? "\n" : "";
        updatedContent = `${entry.content}${prefix}${text}`;
        updatedContentFormat = "plain";
      }

      const [updatedEntry] = await db
        .update(schema.contributionEntries)
        .set({
          content: updatedContent,
          contentFormat: updatedContentFormat,
          updatedAt: new Date(),
        })
        .where(eq(schema.contributionEntries.id, entry.id))
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(updatedEntry, null, 2) }],
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
    "Update the content and metadata of a contribution summary",
    {
      id: z.string().describe("Summary ID"),
      content: z.string().optional().describe("Updated summary text"),
      dateFrom: z
        .string()
        .optional()
        .describe("Updated start date of summarized range (YYYY-MM-DD)"),
      dateTo: z
        .string()
        .optional()
        .describe("Updated end date of summarized range (YYYY-MM-DD)"),
      entryIds: z
        .array(z.string())
        .optional()
        .describe("Updated IDs of the contribution entries this summary covers"),
    },
    async ({ id, content, dateFrom, dateTo, entryIds }) => {
      if (
        content === undefined &&
        dateFrom === undefined &&
        dateTo === undefined &&
        entryIds === undefined
      ) {
        return {
          content: [{ type: "text", text: "Provide at least one field to update." }],
          isError: true,
        };
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (content !== undefined) updates.content = content;
      if (dateFrom !== undefined) updates.dateFrom = dateFrom;
      if (dateTo !== undefined) updates.dateTo = dateTo;
      if (entryIds !== undefined) updates.entryIds = JSON.stringify(entryIds);

      const [summary] = await db
        .update(schema.contributionSummaries)
        .set(updates)
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

  // --- Todos ---

  server.tool(
    "create_contribution_todo",
    "Create a TODO entry for a contribution date or date range",
    {
      content: z.string().describe("The TODO content"),
      dateFrom: z
        .string()
        .optional()
        .describe("Start date for this TODO block (YYYY-MM-DD). Defaults to today."),
      dateTo: z
        .string()
        .optional()
        .describe("End date for this TODO block (YYYY-MM-DD). Defaults to dateFrom."),
      entryIds: z
        .array(z.string())
        .optional()
        .describe("Contribution entry IDs this TODO was derived from"),
      contentFormat: z
        .enum(["plain", "tiptap_json"])
        .optional()
        .default("plain")
        .describe("Content format: 'plain' or 'tiptap_json'"),
    },
    async ({ content, dateFrom, dateTo, entryIds, contentFormat }) => {
      const resolvedDateFrom = dateFrom ?? todayDate();
      const resolvedDateTo = dateTo ?? resolvedDateFrom;
      const [todo] = await db
        .insert(schema.contributionTodos)
        .values({
          content,
          contentFormat: contentFormat ?? "plain",
          dateFrom: resolvedDateFrom,
          dateTo: resolvedDateTo,
          entryIds: JSON.stringify(entryIds ?? []),
        })
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(todo, null, 2) }],
      };
    },
  );

  server.tool(
    "update_contribution_todo",
    "Update the content or metadata of a contribution TODO",
    {
      id: z.string().describe("TODO ID"),
      content: z.string().optional().describe("Updated TODO content"),
      contentFormat: z
        .enum(["plain", "tiptap_json"])
        .optional()
        .describe("Content format: 'plain' or 'tiptap_json'"),
      dateFrom: z
        .string()
        .optional()
        .describe("Updated start date (YYYY-MM-DD)"),
      dateTo: z
        .string()
        .optional()
        .describe("Updated end date (YYYY-MM-DD)"),
      entryIds: z
        .array(z.string())
        .optional()
        .describe("Updated contribution entry IDs linked to this TODO"),
    },
    async ({ id, content, contentFormat, dateFrom, dateTo, entryIds }) => {
      if (
        content === undefined &&
        contentFormat === undefined &&
        dateFrom === undefined &&
        dateTo === undefined &&
        entryIds === undefined
      ) {
        return {
          content: [{ type: "text", text: "Provide at least one field to update." }],
          isError: true,
        };
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (content !== undefined) updates.content = content;
      if (contentFormat !== undefined) updates.contentFormat = contentFormat;
      if (dateFrom !== undefined) updates.dateFrom = dateFrom;
      if (dateTo !== undefined) updates.dateTo = dateTo;
      if (entryIds !== undefined) updates.entryIds = JSON.stringify(entryIds);

      const [todo] = await db
        .update(schema.contributionTodos)
        .set(updates)
        .where(eq(schema.contributionTodos.id, id))
        .returning();

      if (!todo) {
        return {
          content: [{ type: "text", text: `Todo ${id} not found` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(todo, null, 2) }],
      };
    },
  );

  server.tool(
    "delete_contribution_todo",
    "Delete a contribution TODO",
    {
      id: z.string().describe("TODO ID"),
    },
    async ({ id }) => {
      const [todo] = await db
        .delete(schema.contributionTodos)
        .where(eq(schema.contributionTodos.id, id))
        .returning();

      if (!todo) {
        return {
          content: [{ type: "text", text: `Todo ${id} not found` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(todo, null, 2) }],
      };
    },
  );

  server.tool(
    "list_contribution_todos",
    "List contribution TODOs, optionally filtered by date or date range",
    {
      date: z
        .string()
        .optional()
        .describe("Single date filter (YYYY-MM-DD)"),
      dateFrom: z
        .string()
        .optional()
        .describe("Range start date (YYYY-MM-DD)"),
      dateTo: z
        .string()
        .optional()
        .describe("Range end date (YYYY-MM-DD)"),
    },
    async ({ date, dateFrom, dateTo }) => {
      let todos;

      if (date) {
        todos = await db
          .select()
          .from(schema.contributionTodos)
          .where(
            and(
              lte(schema.contributionTodos.dateFrom, date),
              gte(schema.contributionTodos.dateTo, date),
            ),
          )
          .orderBy(desc(schema.contributionTodos.createdAt));
      } else if (dateFrom && dateTo) {
        todos = await db
          .select()
          .from(schema.contributionTodos)
          .where(
            and(
              lte(schema.contributionTodos.dateFrom, dateTo),
              gte(schema.contributionTodos.dateTo, dateFrom),
            ),
          )
          .orderBy(desc(schema.contributionTodos.createdAt));
      } else {
        todos = await db
          .select()
          .from(schema.contributionTodos)
          .orderBy(desc(schema.contributionTodos.createdAt));
      }

      return {
        content: [{ type: "text", text: JSON.stringify(todos, null, 2) }],
      };
    },
  );

  server.tool(
    "append_contribution_todo_item",
    "Append text to a contribution TODO as a bullet item",
    {
      id: z
        .string()
        .optional()
        .describe("TODO ID. Provide either id or date."),
      date: z
        .string()
        .optional()
        .describe("Date covered by the TODO (YYYY-MM-DD). Provide either id or date."),
      text: z.string().describe("Text to append"),
      asBullet: z
        .boolean()
        .optional()
        .default(true)
        .describe("Append as bullet item (default true)."),
    },
    async ({ id, date, text, asBullet }) => {
      const byId = Boolean(id);
      const byDate = Boolean(date);
      if (byId === byDate) {
        return {
          content: [{ type: "text", text: "Provide exactly one target selector: id or date." }],
          isError: true,
        };
      }

      let todo;
      if (id) {
        const [result] = await db
          .select()
          .from(schema.contributionTodos)
          .where(eq(schema.contributionTodos.id, id));
        todo = result;
      } else {
        const todosForDate = await db
          .select()
          .from(schema.contributionTodos)
          .where(
            and(
              lte(schema.contributionTodos.dateFrom, date!),
              gte(schema.contributionTodos.dateTo, date!),
            ),
          )
          .orderBy(desc(schema.contributionTodos.createdAt));

        if (todosForDate.length > 1) {
          return {
            content: [{
              type: "text",
              text: `Found ${todosForDate.length} TODOs covering ${date}. Use id to target a specific TODO.`,
            }],
            isError: true,
          };
        }
        [todo] = todosForDate;
      }

      if (!todo) {
        return {
          content: [{ type: "text", text: id ? `Todo ${id} not found` : `No TODO found for date ${date}` }],
          isError: true,
        };
      }

      const appendAsBullet = asBullet ?? true;
      let updatedContent: string;
      let updatedContentFormat: "plain" | "tiptap_json";

      if (appendAsBullet) {
        if (todo.contentFormat === "plain") {
          updatedContent = JSON.stringify(
            createBulletListFromPlainContent(todo.content, text),
          );
          updatedContentFormat = "tiptap_json";
        } else {
          const nextContent = appendToTiptapBulletList(todo.content, text);
          if (!nextContent) {
            return {
              content: [{ type: "text", text: `Todo ${todo.id} has invalid tiptap_json content.` }],
              isError: true,
            };
          }
          updatedContent = nextContent;
          updatedContentFormat = "tiptap_json";
        }
      } else {
        if (todo.contentFormat === "tiptap_json") {
          return {
            content: [{
              type: "text",
              text: "Appending plain text is only supported for TODOs with contentFormat='plain'.",
            }],
            isError: true,
          };
        }
        const prefix = todo.content.length > 0 ? "\n" : "";
        updatedContent = `${todo.content}${prefix}${text}`;
        updatedContentFormat = "plain";
      }

      const [updatedTodo] = await db
        .update(schema.contributionTodos)
        .set({
          content: updatedContent,
          contentFormat: updatedContentFormat,
          updatedAt: new Date(),
        })
        .where(eq(schema.contributionTodos.id, todo.id))
        .returning();

      return {
        content: [{ type: "text", text: JSON.stringify(updatedTodo, null, 2) }],
      };
    },
  );
}
