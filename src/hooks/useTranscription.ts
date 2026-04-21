import { useState, useCallback } from "react";
import {
  transcribeFile,
  onTranscriptionProgress,
} from "../services/transcription";
import { saveTranscription } from "../services/meetings";
import type { TranscriptionResult } from "../services/transcription";
import type { Transcription } from "../services/meetings";
import { formatTranscriptSegments } from "../services/transcriptFormatting";

export function useTranscription() {
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(
    async (
      meetingId: string,
      audioFileId: string,
      filePath: string,
    ): Promise<Transcription | null> => {
      setTranscribing(true);
      setProgress("Starting...");
      setError(null);

      const unlisten = await onTranscriptionProgress((msg) => {
        setProgress(msg);
      });

      try {
        const result: TranscriptionResult =
          await transcribeFile(filePath);
        const formattedTranscript = formatTranscriptSegments(result.segments);

        const transcription = await saveTranscription(
          meetingId,
          audioFileId,
          formattedTranscript || result.full_text,
          result.model_used,
        );

        setProgress("Complete");
        return transcription;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        setError(message);
        return null;
      } finally {
        unlisten();
        setTranscribing(false);
      }
    },
    [],
  );

  return { transcribe, transcribing, progress, error };
}
