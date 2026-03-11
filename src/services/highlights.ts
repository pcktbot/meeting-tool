import { getDb, schema } from "../db";
import { eq, desc } from "drizzle-orm";

export type Highlight = typeof schema.highlights.$inferSelect;

export interface HighlightWithMeeting extends Highlight {
  meetingTitle: string;
}

export async function createHighlight(data: {
  meetingId: string;
  section: "transcription" | "summary";
  sourceId: string;
  color: string;
  textContent: string;
  fromPos: number;
  toPos: number;
}): Promise<Highlight> {
  const db = getDb();
  const [record] = await db
    .insert(schema.highlights)
    .values(data)
    .returning();
  return record;
}

export async function getHighlightsBySource(
  sourceId: string,
): Promise<Highlight[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.highlights)
    .where(eq(schema.highlights.sourceId, sourceId))
    .orderBy(schema.highlights.fromPos);
}

export async function getAllHighlights(): Promise<HighlightWithMeeting[]> {
  const db = getDb();
  const rows = await db
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
  return rows;
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.highlights)
    .where(eq(schema.highlights.id, id));
}

export async function deleteHighlightsBySource(
  sourceId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.highlights)
    .where(eq(schema.highlights.sourceId, sourceId));
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
  await db
    .delete(schema.highlights)
    .where(eq(schema.highlights.sourceId, sourceId));

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
