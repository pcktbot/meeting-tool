import { getDb, schema } from "../db";
import { eq, desc } from "drizzle-orm";

export type Meeting = typeof schema.meetings.$inferSelect;
export type AudioFile = typeof schema.audioFiles.$inferSelect;
export type Transcription = typeof schema.transcriptions.$inferSelect;
export type Summary = typeof schema.summaries.$inferSelect;

export async function createMeeting(title?: string): Promise<Meeting> {
  const db = await getDb();
  const [meeting] = await db
    .insert(schema.meetings)
    .values({ title: title || "Untitled Meeting" })
    .returning();
  return meeting;
}

export async function getMeetings(): Promise<Meeting[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.meetings)
    .orderBy(desc(schema.meetings.createdAt));
}

export async function getMeetingById(id: string): Promise<Meeting | null> {
  const db = await getDb();
  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id));
  return meeting || null;
}

export async function updateMeetingTitle(
  id: string,
  title: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.meetings)
    .set({ title, updatedAt: new Date() })
    .where(eq(schema.meetings.id, id));
}

export async function deleteMeeting(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(schema.meetings).where(eq(schema.meetings.id, id));
}

export async function saveAudioRecord(
  meetingId: string,
  filePath: string,
  format: string,
  duration: number | null,
  sizeBytes: number | null,
  waveformPeaks?: string | null,
): Promise<AudioFile> {
  const db = await getDb();
  const [record] = await db
    .insert(schema.audioFiles)
    .values({
      meetingId,
      filePath,
      format,
      duration,
      sizeBytes,
      waveformPeaks: waveformPeaks || null,
    })
    .returning();
  return record;
}

export async function saveTranscription(
  meetingId: string,
  audioFileId: string,
  content: string,
  modelUsed: string,
): Promise<Transcription> {
  const db = await getDb();
  const [record] = await db
    .insert(schema.transcriptions)
    .values({ meetingId, audioFileId, content, modelUsed })
    .returning();
  return record;
}

export async function saveSummary(
  meetingId: string,
  transcriptionId: string,
  content: string,
  modelUsed: string,
  promptUsed: string,
): Promise<Summary> {
  const db = await getDb();
  const [record] = await db
    .insert(schema.summaries)
    .values({ meetingId, transcriptionId, content, modelUsed, promptUsed })
    .returning();
  return record;
}

export async function getMeetingAudioFiles(
  meetingId: string,
): Promise<AudioFile[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.audioFiles)
    .where(eq(schema.audioFiles.meetingId, meetingId));
}

export async function getMeetingTranscriptions(
  meetingId: string,
): Promise<Transcription[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.transcriptions)
    .where(eq(schema.transcriptions.meetingId, meetingId));
}

export async function updateTranscriptionContent(
  id: string,
  content: string,
  contentFormat: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.transcriptions)
    .set({ content, contentFormat })
    .where(eq(schema.transcriptions.id, id));
}

export async function updateSummaryContent(
  id: string,
  content: string,
  contentFormat: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(schema.summaries)
    .set({ content, contentFormat })
    .where(eq(schema.summaries.id, id));
}

export async function getMeetingSummaries(
  meetingId: string,
): Promise<Summary[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.summaries)
    .where(eq(schema.summaries.meetingId, meetingId));
}

export interface MeetingWithDetails {
  meeting: Meeting;
  audioFiles: AudioFile[];
  transcriptions: Transcription[];
  summaries: Summary[];
}

export async function getMeetingWithDetails(
  meetingId: string,
): Promise<MeetingWithDetails | null> {
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return null;

  const [audioFiles, transcriptions, summaries] = await Promise.all([
    getMeetingAudioFiles(meetingId),
    getMeetingTranscriptions(meetingId),
    getMeetingSummaries(meetingId),
  ]);

  return { meeting, audioFiles, transcriptions, summaries };
}
