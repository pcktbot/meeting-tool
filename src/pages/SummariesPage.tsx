import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEditor, EditorContent, mergeAttributes } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { EditorToolbar } from "../components/Editor/EditorToolbar";
import { HighlightColorPicker } from "../components/Editor/HighlightColorPicker";
import { loadTipTapContent, extractPlainText } from "../utils/contentConverter";
import {
  getAllSummaries,
  getEntriesInRange,
  createSummary,
  updateSummary,
  updateSummaryTtsAudio,
  type ContributionSummary,
} from "../services/contributions";
import { summarizeContributions } from "../services/summarization";
import { generateTts } from "../services/tts";
import { useSettings } from "../hooks/useSettings";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import "./SummariesPage.css";

const CustomHighlight = Highlight.extend({
  renderHTML({ mark }) {
    return [
      "mark",
      mergeAttributes(this.options.HTMLAttributes, { "data-color": mark.attrs.color }),
      0,
    ];
  },
});

function getTextPreview(content: string, maxLen = 90): string {
  try {
    const parsed = JSON.parse(content) as { content?: Array<{ content?: Array<{ text?: string }> }> };
    if (parsed?.content) {
      let text = "";
      for (const block of parsed.content) {
        if (block.content) {
          for (const inline of block.content) {
            text += inline.text ?? "";
          }
        }
        if (text.length >= maxLen) break;
        text += " ";
      }
      return text.trim().slice(0, maxLen);
    }
  } catch { /* fall through */ }
  return content.replace(/\n/g, " ").slice(0, maxLen);
}

function formatRange(dateFrom: string, dateTo: string): string {
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  return dateFrom === dateTo ? fmt(dateFrom) : `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

// ─── Editor component ──────────────────────────────────────────────────────

interface SummaryEditorProps {
  summary: ContributionSummary;
  onSaved: (updated: ContributionSummary) => void;
}

function SummaryEditor({ summary, onSaved }: SummaryEditorProps) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [ttsState, setTtsState] = useState<"idle" | "generating" | "error">("idle");
  const [ttsError, setTtsError] = useState<string | null>(null);
  const ttsPlayer = useAudioPlayer(
    summary.ttsAudioFilePath ?? undefined,
    summary.ttsAudioDuration ?? null,
  );

  const contentFormat = useMemo(() => {
    try {
      const p = JSON.parse(summary.content);
      return p?.type === "doc" ? "tiptap_json" : "plain";
    } catch { return "plain"; }
  }, [summary.content]);

  const initialContent = useMemo(
    () => loadTipTapContent(summary.content, contentFormat, "summary"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.id],
  );

  const persistSave = useCallback(
    async (jsonStr: string) => {
      setSaveStatus("saving");
      try {
        const updated = await updateSummary(summary.id, jsonStr);
        setSaveStatus("saved");
        onSaved(updated);
      } catch (err) {
        console.error("Failed to save summary:", err);
        setSaveStatus("idle");
      }
    },
    [summary.id, onSaved],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      CustomHighlight.configure({
        multicolor: true,
        HTMLAttributes: { class: "brush-highlight" },
      }),
    ],
    content: initialContent,
    editable: true,
    onUpdate: ({ editor: ed }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("idle");
      saveTimerRef.current = setTimeout(() => {
        void persistSave(JSON.stringify(ed.getJSON()));
      }, 1000);
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleHighlightColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().setHighlight({ color }).run();
    },
    [editor],
  );

  const handleHighlightRemove = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetHighlight().run();
  }, [editor]);

  const handleSpeak = useCallback(async () => {
    setTtsState("generating");
    setTtsError(null);
    try {
      const text = extractPlainText(
        editor?.getHTML() ?? summary.content,
        "plain",
      );
      const path = await generateTts(text, `tts-${summary.id}-${Date.now()}.wav`);
      const updated = await updateSummaryTtsAudio(summary.id, path);
      onSaved(updated);
      setTtsState("idle");
    } catch (err) {
      setTtsError(err instanceof Error ? err.message : String(err));
      setTtsState("error");
    }
  }, [editor, summary.id, summary.content, onSaved]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isInsideHighlight = editor?.isActive("highlight") ?? false;

  if (!editor) return null;

  const entryIds: string[] = JSON.parse(summary.entryIds || "[]");

  return (
    <div className="summaries-editor-panel">
      <div className="summaries-editor-header">
        <div className="summaries-editor-meta">
          <span className="summaries-editor-range">{formatRange(summary.dateFrom, summary.dateTo)}</span>
          <span className="summaries-editor-count">
            {entryIds.length} {entryIds.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="summaries-editor-actions">
          <button
            className="summaries-speak-btn"
            onClick={handleSpeak}
            disabled={ttsState === "generating"}
            title="Read summary in your voice"
            type="button"
          >
            {ttsState === "generating" ? "Generating…" : summary.ttsAudioFilePath ? "Re-speak" : "Speak"}
          </button>
          {summary.ttsAudioFilePath && ttsState === "idle" && (
            <div className="summaries-tts-player">
              <button
                className="summaries-tts-toggle"
                onClick={ttsPlayer.toggle}
                disabled={ttsPlayer.isLoading}
                type="button"
              >
                {ttsPlayer.isLoading ? "…" : ttsPlayer.isPlaying ? "Pause" : "▶"}
              </button>
              <span className="summaries-tts-time">
                {formatTime(ttsPlayer.currentTime)} / {formatTime(ttsPlayer.duration)}
              </span>
            </div>
          )}
          {ttsState === "error" && ttsError && (
            <span className="summaries-tts-error" title={ttsError}>Voice unavailable</span>
          )}
          {saveStatus !== "idle" && (
            <span className="summaries-editor-status">
              {saveStatus === "saving" ? "Saving…" : "Saved"}
            </span>
          )}
        </div>
      </div>

      <div className="rich-text-editor rich-text-editor--editable summaries-editor-body">
        <EditorToolbar editor={editor} />

        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) => {
            const { from, to } = state.selection;
            return from !== to;
          }}
        >
          <HighlightColorPicker
            onSelectColor={handleHighlightColor}
            onRemove={handleHighlightRemove}
            showRemove={isInsideHighlight}
          />
        </BubbleMenu>

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ─── Generate form ─────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function mondayStr() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface GenerateFormProps {
  onGenerated: (summary: ContributionSummary) => void;
  onCancel: () => void;
}

function GenerateForm({ onGenerated, onCancel }: GenerateFormProps) {
  const { apiKey } = useSettings();
  const [dateFrom, setDateFrom] = useState(mondayStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!apiKey) {
      setError("API key required. Add it in Settings.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const entries = await getEntriesInRange(dateFrom, dateTo);
      if (entries.length === 0) {
        setError("No entries found in this date range.");
        setGenerating(false);
        return;
      }
      const entriesText = entries
        .map((e) => {
          const text = extractPlainText(e.content, e.contentFormat ?? "plain");
          return `[${e.entryDate}] ${text}`;
        })
        .join("\n\n");

      const content = await summarizeContributions(entriesText, apiKey);
      const summary = await createSummary(
        content,
        dateFrom,
        dateTo,
        entries.map((e) => e.id),
      );
      onGenerated(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="summaries-generate-form">
      <div className="summaries-generate-fields">
        <label className="summaries-generate-label">
          From
          <input
            type="date"
            className="summaries-generate-date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            disabled={generating}
          />
        </label>
        <label className="summaries-generate-label">
          To
          <input
            type="date"
            className="summaries-generate-date"
            value={dateTo}
            min={dateFrom}
            max={todayStr()}
            onChange={(e) => setDateTo(e.target.value)}
            disabled={generating}
          />
        </label>
      </div>
      {error && <p className="summaries-generate-error">{error}</p>}
      <div className="summaries-generate-actions">
        <button
          className="summaries-generate-btn"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
        <button
          className="summaries-generate-cancel"
          onClick={onCancel}
          disabled={generating}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function SummariesPage() {
  const [summaries, setSummaries] = useState<ContributionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGenerateForm, setShowGenerateForm] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const data = await getAllSummaries();
      setSummaries(data);
      setSelectedId((prev) => {
        if (prev && data.some((s) => s.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (err) {
      console.error("Failed to load summaries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    const handler = () => { void loadAll(); };
    window.addEventListener("app-refresh", handler);
    return () => window.removeEventListener("app-refresh", handler);
  }, [loadAll]);

  const handleSaved = useCallback((updated: ContributionSummary) => {
    setSummaries((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleGenerated = useCallback((summary: ContributionSummary) => {
    setSummaries((prev) => [summary, ...prev]);
    setSelectedId(summary.id);
    setShowGenerateForm(false);
  }, []);

  const selected = summaries.find((s) => s.id === selectedId) ?? null;

  if (loading) {
    return <div className="summaries-loading">Loading summaries…</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="summaries-empty-page">
        <h2>Summaries</h2>
        {showGenerateForm ? (
          <GenerateForm
            onGenerated={handleGenerated}
            onCancel={() => setShowGenerateForm(false)}
          />
        ) : (
          <>
            <p>Summarize your contribution entries over a date range.</p>
            <button
              className="summaries-generate-btn"
              onClick={() => setShowGenerateForm(true)}
            >
              Generate Summary
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="summaries-page">
      {/* Left sidebar: list */}
      <aside className="summaries-sidebar">
        <div className="summaries-sidebar-header">
          <h2 className="summaries-sidebar-title">Summaries</h2>
          <button
            className="summaries-new-btn"
            onClick={() => setShowGenerateForm((v) => !v)}
            title="Generate new summary"
          >
            {showGenerateForm ? "✕" : "+"}
          </button>
        </div>

        {showGenerateForm && (
          <GenerateForm
            onGenerated={handleGenerated}
            onCancel={() => setShowGenerateForm(false)}
          />
        )}

        <ul className="summaries-list">
          {summaries.map((s) => {
            const preview = getTextPreview(s.content);
            const entryIds: string[] = JSON.parse(s.entryIds || "[]");
            return (
              <li key={s.id}>
                <button
                  className={`summaries-list-item ${s.id === selectedId ? "summaries-list-item--active" : ""}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="summaries-item-date">{formatRange(s.dateFrom, s.dateTo)}</span>
                  <span className="summaries-item-count">
                    {entryIds.length} {entryIds.length === 1 ? "entry" : "entries"}
                  </span>
                  {preview && (
                    <span className="summaries-item-preview">{preview}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right panel: editor */}
      <main className="summaries-content">
        {selected ? (
          <SummaryEditor key={selected.id} summary={selected} onSaved={handleSaved} />
        ) : (
          <p className="summaries-no-selection">Select a summary to view and edit it.</p>
        )}
      </main>
    </div>
  );
}
