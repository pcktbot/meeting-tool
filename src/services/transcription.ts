import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface TranscriptionSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  full_text: string;
  model_used: string;
}

export async function transcribeFile(
  filePath: string,
): Promise<TranscriptionResult> {
  return invoke<TranscriptionResult>("transcribe_file", {
    filePath,
  });
}

export async function onTranscriptionProgress(
  callback: (progress: string) => void,
): Promise<() => void> {
  const unlisten = await listen<string>(
    "transcription-progress",
    (event) => {
      callback(event.payload);
    },
  );
  return unlisten;
}
