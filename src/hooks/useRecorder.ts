import { useState, useRef, useCallback } from "react";
import { AudioRecorder } from "../services/audio/recorder";
import { convertToWav } from "../services/audio/converter";
import { saveAudioFile } from "../services/audio/fileManager";
import { extractWaveformPeaks } from "../services/audio/waveform";
import { createMeeting, saveAudioRecord } from "../services/meetings";
import { getSetting, SETTINGS } from "../services/settings";
import type { Meeting, AudioFile } from "../services/meetings";
import type { RecordingStartResult } from "../services/audio/types";

export function useRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startResult, setStartResult] = useState<RecordingStartResult | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(
    null,
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setStartResult(null);
    
    try {
      const savedDeviceId = await getSetting(SETTINGS.MICROPHONE_DEVICE_ID);
      const config = {
        source: "microphone" as const,
        microphoneDeviceId: savedDeviceId || undefined,
      };

      console.log("[useRecorder] Starting with config:", config);

      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      const result = await recorder.start(config);
      setAnalyserNode(recorder.getAnalyserNode());
      setIsRecording(true);
      setDuration(0);
      setStartResult(result);

      intervalRef.current = globalThis.setInterval(() => {
        setDuration(recorder.getDuration());
        setAudioLevel(recorder.getAudioLevel());
      }, 100);

      return result;
    } catch (err) {
      console.error("[useRecorder] Failed to start:", err);
      setError(err instanceof Error ? err.message : "Failed to start recording");
      throw err;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{
    meeting: Meeting;
    audioFile: AudioFile;
  } | null> => {
    if (!recorderRef.current) return null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const currentDuration = recorderRef.current.getDuration();
    const webmBlob = await recorderRef.current.stop();
    recorderRef.current = null;
    setIsRecording(false);
    setAudioLevel(0);
    setAnalyserNode(null);
    setStartResult(null);

    // Convert to WAV for whisper
    const wavBuffer = await convertToWav(webmBlob);

    let peaks: number[] | null = null;
    try {
      peaks = extractWaveformPeaks(wavBuffer);
    } catch (err) {
      console.error("Waveform extraction failed:", err);
    }

    const filename = `recording-${Date.now()}.wav`;
    const filePath = await saveAudioFile(wavBuffer, filename);

    // Create meeting and audio record
    const meeting = await createMeeting();
    const audioFile = await saveAudioRecord(
      meeting.id,
      filePath,
      "wav",
      Math.floor(currentDuration),
      wavBuffer.byteLength,
      peaks ? JSON.stringify(peaks) : null,
    );

    return { meeting, audioFile };
  }, []);

  return {
    isRecording,
    duration,
    audioLevel,
    analyserNode,
    error,
    startResult,
    startRecording,
    stopRecording,
  };
}
