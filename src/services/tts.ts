import { invoke } from "@tauri-apps/api/core";
import { saveAudioFile } from "./audio/fileManager";
import { getSetting, SETTINGS } from "./settings";

const DEFAULT_VOICE_ID = "david";

export async function generateTts(
  text: string,
  filename: string,
): Promise<string> {
  const voiceId = (await getSetting(SETTINGS.TTS_VOICE_ID)) ?? DEFAULT_VOICE_ID;

  // Rust returns Vec<u8> serialised by Tauri 2 as number[]
  const raw = await invoke<number[]>("generate_tts", { text, voiceId });
  const buffer = new Uint8Array(raw).buffer;
  return saveAudioFile(buffer, filename);
}

export async function getTtsStatus(): Promise<{
  model_loaded: boolean;
  model_loading: boolean;
  voices: string[];
} | null> {
  try {
    return await invoke("get_tts_status");
  } catch {
    return null;
  }
}
