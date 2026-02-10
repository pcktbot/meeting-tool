import {
  writeFile,
  readFile,
  mkdir,
  exists,
  copyFile,
} from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

const AUDIO_DIR = "audio";

async function ensureAudioDir(): Promise<string> {
  const base = await appDataDir();
  const audioPath = await join(base, AUDIO_DIR);
  if (!(await exists(audioPath))) {
    await mkdir(audioPath, { recursive: true });
  }
  return audioPath;
}

export async function saveAudioFile(
  data: ArrayBuffer,
  filename: string,
): Promise<string> {
  const dir = await ensureAudioDir();
  const filePath = await join(dir, filename);
  await writeFile(filePath, new Uint8Array(data));
  return filePath;
}

export async function loadAudioFile(filePath: string): Promise<Uint8Array> {
  return await readFile(filePath);
}

export async function importAudioFile(): Promise<{
  path: string;
  format: string;
} | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Audio Files",
        extensions: ["wav", "mp3", "m4a", "webm", "ogg"],
      },
    ],
  });

  if (!selected) return null;

  const filePath = selected as string;
  const ext = filePath.split(".").pop()?.toLowerCase() || "wav";

  // Copy to app data directory
  const filename = `imported-${Date.now()}.${ext}`;
  const dir = await ensureAudioDir();
  const destPath = await join(dir, filename);
  await copyFile(filePath, destPath);

  return { path: destPath, format: ext };
}
