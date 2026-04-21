import { useRef, useState } from "react";
import { AudioRecorder } from "../../services/audio/recorder";
import { getSetting, SETTINGS } from "../../services/settings";
import { convertToWav } from "../../services/audio/converter";
import {
  importAudioFile,
  deleteAudioFile,
  loadAudioFile,
  saveAudioFile,
} from "../../services/audio/fileManager";
import { transcribeFile } from "../../services/transcription";
import { plainTextToTipTapDoc } from "../../utils/contentConverter";
import { formatTranscriptSegments } from "../../services/transcriptFormatting";
import { computeAudioExpiryDate } from "../../services/audioRetention";
import type { ContributionEntryAudioInput } from "../../services/contributions";
import "./DiaryCapturePanel.css";

interface DiaryCapturePanelProps {
  selectedDate: string;
  onEntryCreated: (
    content: string,
    contentFormat: string,
    audio?: ContributionEntryAudioInput | null,
  ) => Promise<void>;
}

export function DiaryCapturePanel({
  selectedDate,
  onEntryCreated,
}: DiaryCapturePanelProps) {
  const recorderRef = useRef<AudioRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const createEntryFromWav = async (
    wavBuffer: ArrayBuffer,
    durationSeconds: number | null = null,
  ) => {
    setStatus("Transcribing audio...");
    const filename = `diary-${Date.now()}.wav`;
    const filePath = await saveAudioFile(wavBuffer, filename);
    const result = await transcribeFile(filePath);
    const transcriptText = formatTranscriptSegments(result.segments) || result.full_text.trim();
    const doc = plainTextToTipTapDoc(transcriptText);
    const audioExpiresAt = await computeAudioExpiryDate();
    await onEntryCreated(JSON.stringify(doc), "tiptap_json", {
      audioFilePath: filePath,
      audioDuration: durationSeconds,
      audioSizeBytes: wavBuffer.byteLength,
      audioExpiresAt,
    });
    setStatus(`Transcript added to ${selectedDate}.`);
    window.dispatchEvent(new CustomEvent("contributions-updated"));
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      const recorder = recorderRef.current;
      if (!recorder) return;

      setIsBusy(true);
      setStatus("Finishing recording...");

      try {
        const blob = await recorder.stop();
        const durationSeconds = Math.floor(recorder.getDuration());
        recorderRef.current = null;
        setIsRecording(false);
        const wavBuffer = await convertToWav(blob);
        await createEntryFromWav(wavBuffer, durationSeconds);
      } catch (err) {
        console.error("Diary recording failed:", err);
        setStatus(err instanceof Error ? err.message : "Recording failed.");
      } finally {
        setIsBusy(false);
      }
      return;
    }

    setIsBusy(true);
    setStatus(null);

    try {
      const savedDeviceId = await getSetting(SETTINGS.MICROPHONE_DEVICE_ID);
      const recorder = new AudioRecorder();
      const config = {
        source: "microphone" as const,
        microphoneDeviceId: savedDeviceId || undefined,
      };

      const result = await recorder.start(config);
      recorderRef.current = recorder;
      setIsRecording(true);
      setStatus(result.fallbackReason ?? "Recording microphone...");
    } catch (err) {
      console.error("Failed to start diary recording:", err);
      setStatus(err instanceof Error ? err.message : "Failed to start recording.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async () => {
    setIsBusy(true);
    setStatus("Importing audio...");

    try {
      const result = await importAudioFile();
      if (!result) {
        setStatus(null);
        return;
      }

      let wavBuffer: ArrayBuffer;
      if (result.format === "wav") {
        const raw = await loadAudioFile(result.path);
        wavBuffer = new Uint8Array(raw).slice().buffer;
      } else {
        const raw = await loadAudioFile(result.path);
        const blob = new Blob([raw.buffer as ArrayBuffer]);
        wavBuffer = await convertToWav(blob);
        await deleteAudioFile(result.path);
      }

      await createEntryFromWav(wavBuffer);
    } catch (err) {
      console.error("Failed to import diary audio:", err);
      setStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="diary-capture">
      <div className="diary-capture-copy">
        <h3 className="diary-capture-title">Capture Voice Notes</h3>
        <p className="diary-capture-text">
          Record a quick audio diary or import a file and the transcript will be
          added to this day as a rich text entry.
        </p>
      </div>
      <div className="diary-capture-actions">
        <button
          className={`diary-capture-btn ${isRecording ? "diary-capture-btn--recording" : ""}`}
          onClick={handleRecordToggle}
          disabled={isBusy && !isRecording}
        >
          {isRecording ? "Stop And Transcribe" : "Record Voice Note"}
        </button>
        <button
          className="diary-capture-secondary"
          onClick={handleImport}
          disabled={isBusy || isRecording}
        >
          Import Audio
        </button>
      </div>
      {status && <p className="diary-capture-status">{status}</p>}
    </div>
  );
}
