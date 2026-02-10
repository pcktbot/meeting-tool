import { useState, useRef, useCallback } from "react";
import { AudioRecorder } from "../services/audio/recorder";
import { convertToWav } from "../services/audio/converter";
import { saveAudioFile } from "../services/audio/fileManager";
import { createMeeting, saveAudioRecord } from "../services/meetings";
import type { Meeting, AudioFile } from "../services/meetings";

export function useRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const intervalRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    await recorder.start();
    setIsRecording(true);
    setDuration(0);

    intervalRef.current = window.setInterval(() => {
      setDuration(recorder.getDuration());
      setAudioLevel(recorder.getAudioLevel());
    }, 100);
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

    // Convert to WAV for whisper
    const wavBuffer = await convertToWav(webmBlob);
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
    );

    return { meeting, audioFile };
  }, []);

  return {
    isRecording,
    duration,
    audioLevel,
    startRecording,
    stopRecording,
  };
}
