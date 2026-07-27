import { getDb, schema } from "../db";
import { eq } from "drizzle-orm";

// Default Claude model used for summaries and transcript/entry cleanup when the
// user has not set one in Settings. Keep in sync with the MCP server's fallback
// in mcp-server/src/tools/cleanup.ts (the two run in separate runtimes).
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

export const SETTINGS = {
  ANTHROPIC_API_KEY: "anthropic_api_key",
  CLAUDE_MODEL: "claude_model",
  CLAUDE_CLEANUP_STYLE_PROMPT: "claude_cleanup_style_prompt",
  WHISPER_MODEL: "whisper_model",
  DEFAULT_LANGUAGE: "default_language",
  AUDIO_SOURCE: "audio_source",
  MICROPHONE_DEVICE_ID: "microphone_device_id",
  AUDIO_RETENTION_DAYS: "audio_retention_days",
  TEXT_BACKUP_LAST_RUN_ON: "text_backup_last_run_on",
  THEME_BG_PRIMARY: "theme_bg_primary",
  THEME_BG_SECONDARY: "theme_bg_secondary",
  THEME_BG_SIDEBAR: "theme_bg_sidebar",
  THEME_TEXT_PRIMARY: "theme_text_primary",
  THEME_TEXT_SECONDARY: "theme_text_secondary",
  THEME_BORDER: "theme_border",
  THEME_HOVER: "theme_hover",
  THEME_ACTIVE: "theme_active",
  THEME_ACCENT: "theme_accent",
  TTS_VOICE_ID: "tts_voice_id",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);

  return result.length > 0 ? result[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date() },
    });
}
