import { useState } from "react";
import { summarizeWithStreaming, MEETING_SUMMARY_PROMPT } from "../../services/summarization";
import { saveSummary } from "../../services/meetings";
import { useSettings } from "../../hooks/useSettings";
import { extractPlainText } from "../../utils/contentConverter";

interface SummarizeButtonProps {
  meetingId: string;
  transcriptionId: string;
  transcriptionContent: string;
  transcriptionContentFormat?: string;
  onSummaryComplete: () => void;
  onStreamChunk?: (fullText: string) => void;
}

export function SummarizeButton({
  meetingId,
  transcriptionId,
  transcriptionContent,
  transcriptionContentFormat = "plain",
  onSummaryComplete,
  onStreamChunk,
}: SummarizeButtonProps) {
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiKey } = useSettings();

  const handleSummarize = async () => {
    if (!apiKey) {
      setError("Please set your Anthropic API key in Settings first.");
      return;
    }

    setSummarizing(true);
    setError(null);

    try {
      const model = "claude-sonnet-4-20250514";
      const plainTextTranscript = extractPlainText(
        transcriptionContent,
        transcriptionContentFormat,
      );
      const fullText = await summarizeWithStreaming(
        plainTextTranscript,
        apiKey,
        (chunk) => {
          onStreamChunk?.(chunk);
        },
        model,
      );

      await saveSummary(
        meetingId,
        transcriptionId,
        fullText,
        model,
        `${MEETING_SUMMARY_PROMPT}${plainTextTranscript}`,
      );

      onSummaryComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="summarize-container">
      <button
        className="summarize-btn"
        onClick={handleSummarize}
        disabled={summarizing || !apiKey}
      >
        {summarizing ? "Summarizing..." : "Summarize with Claude"}
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
