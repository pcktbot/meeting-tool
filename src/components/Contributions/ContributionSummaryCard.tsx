import { useMemo } from "react";
import { marked } from "marked";
import { useEditor, EditorContent, mergeAttributes } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import type { ContributionSummary } from "../../services/contributions";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import "./ContributionSummaryCard.css";

const CustomHighlight = Highlight.extend({
  renderHTML({ mark }) {
    return ["mark", mergeAttributes(this.options.HTMLAttributes, { "data-color": mark.attrs.color }), 0];
  },
});

function MarkdownContent({ content }: { content: string }) {
  return (
    <div
      className="contrib-summary-text markdown-body"
      dangerouslySetInnerHTML={{ __html: marked(content) as string }}
    />
  );
}

function TipTapContent({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try { return JSON.parse(content); } catch { return { type: "doc", content: [] }; }
  }, [content]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      CustomHighlight.configure({ multicolor: true, HTMLAttributes: { class: "brush-highlight" } }),
    ],
    content: parsed,
    editable: false,
  });

  if (!editor) return null;
  return (
    <div className="contrib-summary-text rich-text-editor rich-text-editor--readonly">
      <EditorContent editor={editor} />
    </div>
  );
}

interface ContributionSummaryCardProps {
  readonly summary: ContributionSummary;
}

function TtsAudioBar({ summary }: { summary: ContributionSummary }) {
  const hasTts = Boolean(summary.ttsAudioFilePath) && !summary.ttsAudioDeletedAt;
  const player = useAudioPlayer(
    hasTts ? (summary.ttsAudioFilePath ?? undefined) : undefined,
    summary.ttsAudioDuration ?? null,
  );

  if (!hasTts) return null;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="contrib-summary-tts-bar">
      <button
        className="contrib-summary-tts-toggle"
        onClick={player.toggle}
        disabled={player.isLoading}
        type="button"
      >
        {player.isLoading ? "…" : player.isPlaying ? "Pause" : "▶"}
      </button>
      <span className="contrib-summary-tts-time">
        {fmt(player.currentTime)} / {fmt(player.duration)}
      </span>
    </div>
  );
}

export function ContributionSummaryCard({ summary }: ContributionSummaryCardProps) {
  const isTipTapJson = useMemo(() => {
    try {
      const parsed = JSON.parse(summary.content);
      return parsed?.type === "doc";
    } catch { return false; }
  }, [summary.content]);

  const entryIds: string[] = JSON.parse(summary.entryIds || "[]");
  const rangeLabel =
    summary.dateFrom === summary.dateTo
      ? summary.dateFrom
      : `${summary.dateFrom} — ${summary.dateTo}`;

  return (
    <div className="contrib-summary-card">
      <div className="contrib-summary-header">
        <span className="contrib-summary-badge">Summary</span>
        <span className="contrib-summary-range">{rangeLabel}</span>
        <span className="contrib-summary-count">
          {entryIds.length} {entryIds.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      <TtsAudioBar summary={summary} />
      {isTipTapJson
        ? <TipTapContent content={summary.content} />
        : <MarkdownContent content={summary.content} />}
    </div>
  );
}
