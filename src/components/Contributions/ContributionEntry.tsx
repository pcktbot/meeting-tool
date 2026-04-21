import { useCallback, useState } from "react";
import { RichTextEditor, extractHighlightsFromDoc } from "../Editor/RichTextEditor";
import {
  createContributionHighlight,
  replaceContributionHighlightsForEntry,
} from "../../services/highlights";
import type { ContributionEntry as EntryType } from "../../services/contributions";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import "./ContributionEntry.css";

interface ContributionEntryProps {
  readonly entry: EntryType;
  readonly onUpdate: (id: string, content: string, contentFormat?: string) => Promise<void>;
  readonly onRemove: (id: string) => void;
  readonly readOnly?: boolean;
}

export function ContributionEntry({
  entry,
  onUpdate,
  onRemove,
  readOnly = false,
}: ContributionEntryProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasAudio = Boolean(entry.audioFilePath);
  const audioExpired = Boolean(entry.audioDeletedAt);
  const player = useAudioPlayer(
    !audioExpired ? entry.audioFilePath ?? undefined : undefined,
    entry.audioDuration ?? null,
  );

  const handleSave = useCallback(
    async (jsonContent: string) => {
      setSaving(true);
      setSaveError(null);
      try {
        await onUpdate(entry.id, jsonContent, "tiptap_json");

        const doc = JSON.parse(jsonContent);
        const marks = extractHighlightsFromDoc(doc);
        await replaceContributionHighlightsForEntry(entry.id, marks);
        window.dispatchEvent(new CustomEvent("highlights-updated"));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [entry.id, onUpdate],
  );

  const handleHighlightAdd = useCallback(
    async (data: {
      color: string;
      textContent: string;
      fromPos: number;
      toPos: number;
    }) => {
      await createContributionHighlight({
        contributionEntryId: entry.id,
        ...data,
      });
      window.dispatchEvent(new CustomEvent("highlights-updated"));
    },
    [entry.id],
  );

  const time = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`contrib-entry ${editing ? "contrib-entry--editing" : ""} ${readOnly ? "contrib-entry--readonly" : ""}`}
    >
      <span className="contrib-entry-time">{time}</span>
      <div className="contrib-entry-body">
        {hasAudio && (
          <div className="contrib-entry-audio">
            {audioExpired ? (
              <span className="contrib-entry-audio-expired">Voice note expired</span>
            ) : (
              <>
                <button
                  className="contrib-entry-audio-toggle"
                  onClick={player.toggle}
                  disabled={player.isLoading}
                  type="button"
                >
                  {player.isLoading ? "..." : player.isPlaying ? "Pause" : "Play"}
                </button>
                <span className="contrib-entry-audio-time">
                  {formatTime(player.currentTime)}
                  {" / "}
                  {formatTime(player.duration)}
                </span>
              </>
            )}
          </div>
        )}
        <div className="contrib-entry-content">
          <RichTextEditor
            content={entry.content}
            contentFormat={entry.contentFormat}
            section="entry"
            editable={editing}
            onSave={handleSave}
            onHighlightAdd={handleHighlightAdd}
          />
        </div>
        {editing && (
          <div className="contrib-entry-actions">
            <button
              className="contrib-entry-save"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Done
            </button>
            {saveError && <span className="contrib-entry-error">{saveError}</span>}
          </div>
        )}
      </div>
      {!editing && !readOnly && (
        <div className="contrib-entry-controls">
          <button
            className="contrib-entry-edit"
            onClick={() => setEditing(true)}
            title="Edit entry"
          >
            Edit
          </button>
          <button
            className="contrib-entry-remove"
            onClick={() => onRemove(entry.id)}
            title="Remove entry"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
