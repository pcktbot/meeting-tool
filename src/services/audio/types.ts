export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number;
}

export interface AudioFileInfo {
  id: string;
  filePath: string;
  format: SupportedFormat;
  duration: number;
  sizeBytes: number;
}

export type SupportedFormat = "wav" | "mp3" | "m4a" | "webm" | "ogg";

export type AudioSource = "microphone" | "system" | "both";

export interface AudioSourceConfig {
  source: AudioSource;
  microphoneDeviceId?: string;
}
