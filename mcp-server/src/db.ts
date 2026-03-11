import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/db/schema.ts";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

function getDbPath(): string {
  // Allow override via environment variable
  if (process.env.MEETING_TOOL_DB_PATH) {
    return process.env.MEETING_TOOL_DB_PATH;
  }

  // Match Tauri's app data directory on macOS
  const appDataDir = join(
    homedir(),
    "Library",
    "Application Support",
    "com.meeting-tool.app",
  );
  const dbPath = join(appDataDir, "meeting-tool.db");

  if (!existsSync(dbPath)) {
    throw new Error(
      `Database not found at ${dbPath}. Run the Meeting Transcriber app first to create the database, or set MEETING_TOOL_DB_PATH environment variable.`,
    );
  }

  return dbPath;
}

const dbPath = getDbPath();
const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode=WAL");
sqlite.exec("PRAGMA foreign_keys=ON");
sqlite.exec("PRAGMA busy_timeout=5000");

export const db = drizzle(sqlite, { schema });
export { schema };
