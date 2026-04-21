import { useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import { cleanTranscript } from "../../services/summarization";
import { updateTranscriptionContent } from "../../services/meetings";
import { extractPlainText } from "../../utils/contentConverter";

interface CleanTranscriptButtonProps {
  transcriptionId: string;
  content: string;
  contentFormat: string;
  onComplete: () => void;
}

export function CleanTranscriptButton({
  transcriptionId,
  content,
  contentFormat,
  onComplete,
}: CleanTranscriptButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiKey } = useSettings();

  const handleClean = async () => {
    if (!apiKey) {
      setError("Please set your Anthropic API key in Settings first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const transcriptText = extractPlainText(content, contentFormat);
      const cleaned = await cleanTranscript(transcriptText, apiKey);
      await updateTranscriptionContent(
        transcriptionId,
        cleaned.jsonContent,
        "tiptap_json",
      );
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="summarize-container">
      <button
        className="summarize-btn"
        onClick={handleClean}
        disabled={busy || !apiKey}
        type="button"
      >
        {busy ? "Cleaning..." : "Clean Transcript with Claude"}
      </button>
      {error && <p className="summarize-error">{error}</p>}
      {!apiKey && (
        <p className="summarize-warning">
          API key required. Go to Settings to add it.
        </p>
      )}
    </div>
  );
}
