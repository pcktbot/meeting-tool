import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSetting, SETTINGS } from "./settings";
import { deleteAudioFile } from "./audio/fileManager";

const DEFAULT_RETENTION_DAYS = 14;
const NEVER_RETENTION_VALUE = "never";
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function startOfNow(): Date {
  return new Date();
}

function parseRetentionDays(value: string | null): number | null {
  if (!value || value.trim() === "") return DEFAULT_RETENTION_DAYS;
  if (value === NEVER_RETENTION_VALUE) return null;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_RETENTION_DAYS;
  }

  return parsed;
}

export async function getAudioRetentionDays(): Promise<number | null> {
  const configured = await getSetting(SETTINGS.AUDIO_RETENTION_DAYS);
  return parseRetentionDays(configured);
}

export async function computeAudioExpiryDate(
  createdAt: Date = startOfNow(),
): Promise<Date | null> {
  const retentionDays = await getAudioRetentionDays();
  if (retentionDays === null) return null;

  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + retentionDays);
  return expiresAt;
}

export function getAudioRetentionCleanupIntervalMs(): number {
  return CLEANUP_INTERVAL_MS;
}

export async function pruneExpiredAudioFiles(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const retentionDays = await getAudioRetentionDays();
  let prunedCount = 0;

  if (retentionDays !== null) {
    const activeMeetingAudio = await db
      .select()
      .from(schema.audioFiles)
      .where(isNull(schema.audioFiles.deletedAt));

    for (const audio of activeMeetingAudio) {
      const expectedExpiresAt = new Date(audio.createdAt);
      expectedExpiresAt.setDate(expectedExpiresAt.getDate() + retentionDays);

      if (
        !audio.expiresAt ||
        audio.expiresAt.getTime() !== expectedExpiresAt.getTime()
      ) {
        await db
          .update(schema.audioFiles)
          .set({ expiresAt: expectedExpiresAt })
          .where(eq(schema.audioFiles.id, audio.id));
      }
    }

    const activeContributionAudio = await db
      .select()
      .from(schema.contributionEntries)
      .where(
        and(
          isNull(schema.contributionEntries.audioDeletedAt),
          isNotNull(schema.contributionEntries.audioFilePath),
        ),
      );

    for (const entry of activeContributionAudio) {
      const expectedExpiresAt = new Date(entry.createdAt);
      expectedExpiresAt.setDate(expectedExpiresAt.getDate() + retentionDays);

      if (
        !entry.audioExpiresAt ||
        entry.audioExpiresAt.getTime() !== expectedExpiresAt.getTime()
      ) {
        await db
          .update(schema.contributionEntries)
          .set({ audioExpiresAt: expectedExpiresAt })
          .where(eq(schema.contributionEntries.id, entry.id));
      }
    }
  }

  const expiredMeetingAudio = await db
    .select()
    .from(schema.audioFiles)
    .where(
      and(
        isNull(schema.audioFiles.deletedAt),
        lte(schema.audioFiles.expiresAt, now),
      ),
    );

  for (const audio of expiredMeetingAudio) {
    try {
      await deleteAudioFile(audio.filePath);
    } catch (err) {
      console.error("Failed to delete expired meeting audio:", err);
    }

    await db
      .update(schema.audioFiles)
      .set({ deletedAt: now })
      .where(eq(schema.audioFiles.id, audio.id));
    prunedCount += 1;
  }

  const expiredContributionAudio = await db
    .select()
    .from(schema.contributionEntries)
    .where(
      and(
        isNull(schema.contributionEntries.audioDeletedAt),
        lte(schema.contributionEntries.audioExpiresAt, now),
        isNotNull(schema.contributionEntries.audioFilePath),
      ),
    );

  for (const entry of expiredContributionAudio) {
    if (entry.audioFilePath) {
      try {
        await deleteAudioFile(entry.audioFilePath);
      } catch (err) {
        console.error("Failed to delete expired contribution audio:", err);
      }
    }

    await db
      .update(schema.contributionEntries)
      .set({ audioDeletedAt: now })
      .where(eq(schema.contributionEntries.id, entry.id));
    prunedCount += 1;
  }

  return prunedCount;
}
