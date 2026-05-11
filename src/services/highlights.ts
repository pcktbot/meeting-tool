import { getDb, schema } from "../db";
import { eq } from "drizzle-orm";

export type MeetingHighlight = typeof schema.highlights.$inferSelect;
export type ContributionHighlight = typeof schema.contributionHighlights.$inferSelect;

export interface HighlightListItem {
  id: string;
  color: string;
  textContent: string;
  fromPos: number;
  toPos: number;
  createdAt: Date;
  section: "transcription" | "summary" | "entry";
  targetType: "meeting" | "contribution";
  targetId: string;
  targetLabel: string;
  contributionDate?: string;
}

function formatContributionLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function createHighlight(data: {
  meetingId: string;
  section: "transcription" | "summary";
  sourceId: string;
  color: string;
  textContent: string;
  fromPos: number;
  toPos: number;
}): Promise<MeetingHighlight> {
  const db = getDb();
  const [record] = await db.insert(schema.highlights).values(data).returning();
  return record;
}

export async function createContributionHighlight(data: {
  contributionEntryId: string;
  color: string;
  textContent: string;
  fromPos: number;
  toPos: number;
}): Promise<ContributionHighlight> {
  const db = getDb();
  const [record] = await db
    .insert(schema.contributionHighlights)
    .values(data)
    .returning();
  return record;
}

export async function getHighlightsBySource(
  sourceId: string,
): Promise<MeetingHighlight[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.highlights)
    .where(eq(schema.highlights.sourceId, sourceId))
    .orderBy(schema.highlights.fromPos);
}

export async function getContributionHighlightsByEntry(
  contributionEntryId: string,
): Promise<ContributionHighlight[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.contributionHighlights)
    .where(eq(schema.contributionHighlights.contributionEntryId, contributionEntryId))
    .orderBy(schema.contributionHighlights.fromPos);
}

export async function getAllHighlights(): Promise<HighlightListItem[]> {
  const db = getDb();
  const [meetingRows, contributionRows] = await Promise.all([
    db
      .select({
        id: schema.highlights.id,
        color: schema.highlights.color,
        textContent: schema.highlights.textContent,
        fromPos: schema.highlights.fromPos,
        toPos: schema.highlights.toPos,
        createdAt: schema.highlights.createdAt,
        section: schema.highlights.section,
        targetId: schema.highlights.meetingId,
        targetLabel: schema.meetings.title,
      })
      .from(schema.highlights)
      .innerJoin(schema.meetings, eq(schema.highlights.meetingId, schema.meetings.id)),
    db
      .select({
        id: schema.contributionHighlights.id,
        color: schema.contributionHighlights.color,
        textContent: schema.contributionHighlights.textContent,
        fromPos: schema.contributionHighlights.fromPos,
        toPos: schema.contributionHighlights.toPos,
        createdAt: schema.contributionHighlights.createdAt,
        targetId: schema.contributionHighlights.contributionEntryId,
        targetLabel: schema.contributionEntries.entryDate,
        contributionDate: schema.contributionEntries.entryDate,
      })
      .from(schema.contributionHighlights)
      .innerJoin(
        schema.contributionEntries,
        eq(
          schema.contributionHighlights.contributionEntryId,
          schema.contributionEntries.id,
        ),
      ),
  ]);

  const normalized: HighlightListItem[] = [
    ...meetingRows.map((row) => ({
      ...row,
      section: row.section as "transcription" | "summary",
      targetType: "meeting" as const,
    })),
    ...contributionRows.map((row) => ({
      ...row,
      targetLabel: formatContributionLabel(row.targetLabel),
      section: "entry" as const,
      targetType: "contribution" as const,
    })),
  ];

  return normalized.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.highlights).where(eq(schema.highlights.id, id));
}

export async function deleteContributionHighlight(id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.contributionHighlights)
    .where(eq(schema.contributionHighlights.id, id));
}

export async function deleteHighlightsBySource(sourceId: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.highlights).where(eq(schema.highlights.sourceId, sourceId));
}

export async function replaceHighlightsForSource(
  sourceId: string,
  meetingId: string,
  section: "transcription" | "summary",
  highlights: {
    color: string;
    textContent: string;
    fromPos: number;
    toPos: number;
  }[],
): Promise<void> {
  const db = getDb();
  await db.delete(schema.highlights).where(eq(schema.highlights.sourceId, sourceId));

  if (highlights.length > 0) {
    await db.insert(schema.highlights).values(
      highlights.map((h) => ({
        meetingId,
        section,
        sourceId,
        ...h,
      })),
    );
  }
}

export async function replaceContributionHighlightsForEntry(
  contributionEntryId: string,
  highlights: {
    color: string;
    textContent: string;
    fromPos: number;
    toPos: number;
  }[],
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.contributionHighlights)
    .where(eq(schema.contributionHighlights.contributionEntryId, contributionEntryId));

  if (highlights.length > 0) {
    await db.insert(schema.contributionHighlights).values(
      highlights.map((h) => ({
        contributionEntryId,
        ...h,
      })),
    );
  }
}
