import { getDb, schema } from "../db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export type ContributionEntry = typeof schema.contributionEntries.$inferSelect;
export type ContributionSummary =
  typeof schema.contributionSummaries.$inferSelect;
export type ContributionTodo = typeof schema.contributionTodos.$inferSelect;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Entries ---

export async function createEntry(
  content: string,
  entryDate?: string,
  contentFormat: string = "plain",
): Promise<ContributionEntry> {
  const db = getDb();
  const [record] = await db
    .insert(schema.contributionEntries)
    .values({ content, contentFormat, entryDate: entryDate ?? todayDate() })
    .returning();
  return record;
}

export async function updateEntry(
  id: string,
  content: string,
  contentFormat?: string,
): Promise<ContributionEntry> {
  const db = getDb();
  const updates: Record<string, unknown> = { content, updatedAt: new Date() };
  if (contentFormat !== undefined) updates.contentFormat = contentFormat;
  const [record] = await db
    .update(schema.contributionEntries)
    .set(updates)
    .where(eq(schema.contributionEntries.id, id))
    .returning();
  return record;
}

export async function deleteEntry(id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.contributionEntries)
    .where(eq(schema.contributionEntries.id, id));
}

export async function getEntriesByDate(
  date: string,
): Promise<ContributionEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionEntries)
    .where(eq(schema.contributionEntries.entryDate, date))
    .orderBy(desc(schema.contributionEntries.createdAt));
}

export async function getEntriesInRange(
  from: string,
  to: string,
): Promise<ContributionEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionEntries)
    .where(
      and(
        gte(schema.contributionEntries.entryDate, from),
        lte(schema.contributionEntries.entryDate, to),
      ),
    )
    .orderBy(
      desc(schema.contributionEntries.entryDate),
      desc(schema.contributionEntries.createdAt),
    );
}

// --- Summaries ---

export async function createSummary(
  content: string,
  dateFrom: string,
  dateTo: string,
  entryIds: string[],
): Promise<ContributionSummary> {
  const db = getDb();
  const [record] = await db
    .insert(schema.contributionSummaries)
    .values({ content, dateFrom, dateTo, entryIds: JSON.stringify(entryIds) })
    .returning();
  return record;
}

export async function updateSummary(
  id: string,
  content: string,
): Promise<ContributionSummary> {
  const db = getDb();
  const [record] = await db
    .update(schema.contributionSummaries)
    .set({ content, updatedAt: new Date() })
    .where(eq(schema.contributionSummaries.id, id))
    .returning();
  return record;
}

export async function deleteSummary(id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.contributionSummaries)
    .where(eq(schema.contributionSummaries.id, id));
}

export async function getSummariesForDate(
  date: string,
): Promise<ContributionSummary[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionSummaries)
    .where(
      and(
        lte(schema.contributionSummaries.dateFrom, date),
        gte(schema.contributionSummaries.dateTo, date),
      ),
    )
    .orderBy(desc(schema.contributionSummaries.createdAt));
}

export async function getSummariesInRange(
  from: string,
  to: string,
): Promise<ContributionSummary[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionSummaries)
    .where(
      and(
        lte(schema.contributionSummaries.dateFrom, to),
        gte(schema.contributionSummaries.dateTo, from),
      ),
    )
    .orderBy(desc(schema.contributionSummaries.createdAt));
}

// --- Todos ---

export async function createTodo(
  content: string,
  dateFrom?: string,
  dateTo?: string,
  entryIds: string[] = [],
  contentFormat: string = "plain",
): Promise<ContributionTodo> {
  const db = getDb();
  const resolvedDateFrom = dateFrom ?? todayDate();
  const resolvedDateTo = dateTo ?? resolvedDateFrom;
  const [record] = await db
    .insert(schema.contributionTodos)
    .values({
      content,
      contentFormat,
      dateFrom: resolvedDateFrom,
      dateTo: resolvedDateTo,
      entryIds: JSON.stringify(entryIds),
    })
    .returning();
  return record;
}

export async function updateTodo(
  id: string,
  content: string,
  contentFormat?: string,
): Promise<ContributionTodo> {
  const db = getDb();
  const updates: Record<string, unknown> = { content, updatedAt: new Date() };
  if (contentFormat !== undefined) updates.contentFormat = contentFormat;
  const [record] = await db
    .update(schema.contributionTodos)
    .set(updates)
    .where(eq(schema.contributionTodos.id, id))
    .returning();
  return record;
}

export async function deleteTodo(id: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.contributionTodos).where(eq(schema.contributionTodos.id, id));
}

export async function getTodosForDate(date: string): Promise<ContributionTodo[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionTodos)
    .where(
      and(
        lte(schema.contributionTodos.dateFrom, date),
        gte(schema.contributionTodos.dateTo, date),
      ),
    )
    .orderBy(desc(schema.contributionTodos.createdAt));
}

export async function getTodosInRange(
  from: string,
  to: string,
): Promise<ContributionTodo[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionTodos)
    .where(
      and(
        lte(schema.contributionTodos.dateFrom, to),
        gte(schema.contributionTodos.dateTo, from),
      ),
    )
    .orderBy(desc(schema.contributionTodos.createdAt));
}
