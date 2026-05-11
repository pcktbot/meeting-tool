import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting, SETTINGS } from "./settings";

const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface TextBackupResult {
  backupDate: string;
  backupDir: string;
  backupPath: string;
  prunedCount: number;
  rowCount: number;
}

let backupRunPromise: Promise<TextBackupResult | null> | null = null;

function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function executeBackupForDate(
  backupDate: string,
): Promise<TextBackupResult> {
  const result = await invoke<TextBackupResult>("export_text_backup", {
    backupDate,
  });
  await setSetting(SETTINGS.TEXT_BACKUP_LAST_RUN_ON, backupDate);
  return result;
}

export async function ensureDailyTextBackup(): Promise<TextBackupResult | null> {
  if (backupRunPromise) {
    return backupRunPromise;
  }

  backupRunPromise = (async () => {
    const today = getLocalDateString();
    const lastRun = await getSetting(SETTINGS.TEXT_BACKUP_LAST_RUN_ON);
    if (lastRun === today) {
      return null;
    }

    return executeBackupForDate(today);
  })();

  try {
    return await backupRunPromise;
  } finally {
    backupRunPromise = null;
  }
}

export async function runTextBackupNow(): Promise<TextBackupResult> {
  const today = getLocalDateString();
  return executeBackupForDate(today);
}

export async function getTextBackupDirectory(): Promise<string> {
  return invoke<string>("get_text_backup_directory");
}

export async function openTextBackupDirectory(): Promise<void> {
  await invoke("open_text_backup_directory");
}

export async function getLastTextBackupDate(): Promise<string | null> {
  return getSetting(SETTINGS.TEXT_BACKUP_LAST_RUN_ON);
}

export function getBackupCheckIntervalMs(): number {
  return BACKUP_CHECK_INTERVAL_MS;
}
