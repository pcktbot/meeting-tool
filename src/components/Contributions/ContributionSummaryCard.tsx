import { useMemo } from "react";
import { marked } from "marked";
import { useEditor, EditorContent, mergeAttributes } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import type { ContributionSummary } from "../../services/contributions";
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
      {isTipTapJson
        ? <TipTapContent content={summary.content} />
        : <MarkdownContent content={summary.content} />}
    </div>
  );
}
