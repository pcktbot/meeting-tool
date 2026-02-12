import { useCallback } from "react";
import {
  RichTextEditor,
  extractHighlightsFromDoc,
} from "../Editor/RichTextEditor";
import {
  updateSummaryContent,
} from "../../services/meetings";
import {
  createHighlight,
  replaceHighlightsForSource,
} from "../../services/highlights";

interface SummaryEditorProps {
  summaryId: string;
  meetingId: string;
  content: string;
  contentFormat: string;
  editable: boolean;
}

export function SummaryEditor({
  summaryId,
  meetingId,
  content,
  contentFormat,
  editable,
}: SummaryEditorProps) {
  const handleSave = useCallback(
    async (jsonContent: string) => {
      await updateSummaryContent(summaryId, jsonContent, "tiptap_json");

      try {
        const doc = JSON.parse(jsonContent);
        const marks = extractHighlightsFromDoc(doc);
        await replaceHighlightsForSource(
          summaryId,
          meetingId,
          "summary",
          marks,
        );
        window.dispatchEvent(new CustomEvent("highlights-updated"));
      } catch {
        // Non-critical
      }
    },
    [summaryId, meetingId],
  );

  const handleHighlightAdd = useCallback(
    async (data: {
      color: string;
      textContent: string;
      fromPos: number;
      toPos: number;
    }) => {
      await createHighlight({
        meetingId,
        section: "summary",
        sourceId: summaryId,
        ...data,
      });
      window.dispatchEvent(new CustomEvent("highlights-updated"));
    },
    [meetingId, summaryId],
  );

  const handleHighlightRemove = useCallback(
    async (_fromPos: number, _toPos: number) => {
      // Positions will be resynced on next save
    },
    [],
  );

  return (
    <div className="summary-view">
      <h3 className="summary-heading">Summary</h3>
      <RichTextEditor
        content={content}
        contentFormat={contentFormat}
        section="summary"
        editable={editable}
        onSave={handleSave}
        onHighlightAdd={handleHighlightAdd}
        onHighlightRemove={handleHighlightRemove}
      />
    </div>
  );
}
