import { useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import { cleanTranscript } from "../../services/summarization";
import { extractPlainText } from "../../utils/contentConverter";

interface CleanContributionEntryButtonProps {
  content: string;
  contentFormat: string;
  onClean: (jsonContent: string) => Promise<void>;
}

export function CleanContributionEntryButton({
  content,
  contentFormat,
  onClean,
}: CleanContributionEntryButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiKey, cleanupStylePrompt } = useSettings();

  const handleClean = async () => {
    if (!apiKey) {
      setError("Add your Anthropic API key in Settings first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const entryText = extractPlainText(content, contentFormat);
      const cleaned = await cleanTranscript(
        entryText,
        apiKey,
        cleanupStylePrompt,
      );
      await onClean(cleaned.jsonContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="contrib-entry-cleanup">
      <button
        className="contrib-entry-cleanup-btn"
        onClick={handleClean}
        disabled={busy || !apiKey}
        type="button"
      >
        {busy ? "Cleaning..." : "Clean With Claude"}
      </button>
      {error && <span className="contrib-entry-cleanup-error">{error}</span>}
      {!apiKey && (
        <span className="contrib-entry-cleanup-hint">
          API key required.
        </span>
      )}
    </div>
  );
}
