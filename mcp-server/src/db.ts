import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/db/schema.ts";
import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";

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
const schemaStatements = readFileSync(
  new URL("../../src/db/schema.sql", import.meta.url),
  "utf8",
)
  .split(/;\s*\n/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of schemaStatements) {
  sqlite.exec(`${statement};`);
}

const migrations: Array<{ checkSql: string; alterSql: string }> = [
  {
    checkSql:
      "SELECT COUNT(*) FROM pragma_table_info('contribution_entries') WHERE name='content_format'",
    alterSql:
      "ALTER TABLE contribution_entries ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'",
  },
];

for (const { checkSql, alterSql } of migrations) {
  const result = sqlite
    .query(checkSql)
    .get() as { "COUNT(*)"?: number; count?: number } | null;
  const count = result?.["COUNT(*)"] ?? result?.count ?? 0;
  if (count === 0) {
    sqlite.exec(alterSql);
  }
}

export const db = drizzle(sqlite, { schema });
export { schema };
