import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEditor, EditorContent, mergeAttributes } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { EditorToolbar } from "../components/Editor/EditorToolbar";
import { HighlightColorPicker } from "../components/Editor/HighlightColorPicker";
import { loadTipTapContent } from "../utils/contentConverter";
import {
  getAllSummaries,
  updateSummary,
  type ContributionSummary,
} from "../services/contributions";
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
        {saveStatus !== "idle" && (
          <span className="summaries-editor-status">
            {saveStatus === "saving" ? "Saving…" : "Saved"}
          </span>
        )}
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

// ─── Page ──────────────────────────────────────────────────────────────────

export function SummariesPage() {
  const [summaries, setSummaries] = useState<ContributionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleSaved = useCallback((updated: ContributionSummary) => {
    setSummaries((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const selected = summaries.find((s) => s.id === selectedId) ?? null;

  if (loading) {
    return <div className="summaries-loading">Loading summaries…</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="summaries-empty-page">
        <h2>Summaries</h2>
        <p>No summaries yet. Summaries are generated from your contribution entries.</p>
      </div>
    );
  }

  return (
    <div className="summaries-page">
      {/* Left sidebar: list */}
      <aside className="summaries-sidebar">
        <h2 className="summaries-sidebar-title">Summaries</h2>
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
