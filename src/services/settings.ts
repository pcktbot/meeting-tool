import { getDb, schema } from "../db";
import { eq } from "drizzle-orm";

export const SETTINGS = {
  ANTHROPIC_API_KEY: "anthropic_api_key",
  WHISPER_MODEL: "whisper_model",
  DEFAULT_LANGUAGE: "default_language",
  AUDIO_SOURCE: "audio_source",
  MICROPHONE_DEVICE_ID: "microphone_device_id",
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
