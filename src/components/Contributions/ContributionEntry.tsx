import { useCallback, useState } from "react";
import { RichTextEditor, extractHighlightsFromDoc } from "../Editor/RichTextEditor";
import {
  createContributionHighlight,
  replaceContributionHighlightsForEntry,
} from "../../services/highlights";
import {
  updateEntryTtsAudio,
} from "../../services/contributions";
import type { ContributionEntry as EntryType } from "../../services/contributions";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { extractPlainText } from "../../utils/contentConverter";
import { generateTts } from "../../services/tts";
import { CleanContributionEntryButton } from "./CleanContributionEntryButton";
import "./ContributionEntry.css";

interface ContributionEntryProps {
  readonly entry: EntryType;
  readonly onUpdate: (id: string, content: string, contentFormat?: string) => Promise<void>;
  readonly onEntryUpdated?: (updated: EntryType) => void;
  readonly onRemove: (id: string) => void;
  readonly readOnly?: boolean;
}

export function ContributionEntry({
  entry,
  onUpdate,
  onEntryUpdated,
  onRemove,
  readOnly = false,
}: ContributionEntryProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<"idle" | "generating" | "error">("idle");
  const [ttsError, setTtsError] = useState<string | null>(null);
  const hasAudio = Boolean(entry.audioFilePath);
  const audioExpired = Boolean(entry.audioDeletedAt);
  const player = useAudioPlayer(
    !audioExpired ? entry.audioFilePath ?? undefined : undefined,
    entry.audioDuration ?? null,
  );
  const ttsPlayer = useAudioPlayer(
    entry.ttsAudioFilePath ?? undefined,
    null,
  );

  const handleSpeak = useCallback(async () => {
    setTtsState("generating");
    setTtsError(null);
    try {
      const text = extractPlainText(entry.content, entry.contentFormat ?? "plain");
      const path = await generateTts(text, `tts-entry-${entry.id}-${Date.now()}.wav`);
      const updated = await updateEntryTtsAudio(entry.id, path);
      onEntryUpdated?.(updated);
      setTtsState("idle");
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : String(err));
      setTtsState("error");
    }
  }, [entry.id, entry.content, entry.contentFormat, onEntryUpdated]);

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

  const handleClaudeClean = useCallback(
    async (jsonContent: string) => {
      await onUpdate(entry.id, jsonContent, "tiptap_json");
      await replaceContributionHighlightsForEntry(entry.id, []);
      window.dispatchEvent(new CustomEvent("highlights-updated"));
    },
    [entry.id, onUpdate],
  );

  const handleEntryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly || editing) return;

      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setEditing(true);
      }
    },
    [editing, readOnly],
  );

  return (
    <div
      className={`contrib-entry ${editing ? "contrib-entry--editing" : ""} ${readOnly ? "contrib-entry--readonly" : ""}`}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={handleEntryKeyDown}
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
            onShortcutSave={() => setEditing(false)}
            onHighlightAdd={handleHighlightAdd}
          />
        </div>
        {!editing && !readOnly && (
          <CleanContributionEntryButton
            content={entry.content}
            contentFormat={entry.contentFormat}
            onClean={handleClaudeClean}
          />
        )}
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
            className="contrib-entry-speak"
            onClick={handleSpeak}
            disabled={ttsState === "generating"}
            title={ttsError ?? "Read entry in your voice"}
            type="button"
          >
            {ttsState === "generating" ? "…" : "♪"}
          </button>
          {entry.ttsAudioFilePath && ttsState === "idle" && (
            <button
              className="contrib-entry-tts-toggle"
              onClick={ttsPlayer.toggle}
              disabled={ttsPlayer.isLoading}
              type="button"
              title="Play TTS audio"
            >
              {ttsPlayer.isLoading ? "…" : ttsPlayer.isPlaying ? "⏸" : "▶"}
            </button>
          )}
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
