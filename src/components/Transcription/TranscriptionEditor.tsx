import { useCallback } from "react";
import {
  RichTextEditor,
  extractHighlightsFromDoc,
} from "../Editor/RichTextEditor";
import {
  updateTranscriptionContent,
} from "../../services/meetings";
import {
  createHighlight,
  replaceHighlightsForSource,
} from "../../services/highlights";

interface TranscriptionEditorProps {
  transcriptionId: string;
  meetingId: string;
  content: string;
  contentFormat: string;
  editable: boolean;
}

export function TranscriptionEditor({
  transcriptionId,
  meetingId,
  content,
  contentFormat,
  editable,
}: TranscriptionEditorProps) {
  const handleSave = useCallback(
    async (jsonContent: string) => {
      await updateTranscriptionContent(
        transcriptionId,
        jsonContent,
        "tiptap_json",
      );

      // Recompute highlight positions from the document
      try {
        const doc = JSON.parse(jsonContent);
        const marks = extractHighlightsFromDoc(doc);
        await replaceHighlightsForSource(
          transcriptionId,
          meetingId,
          "transcription",
          marks,
        );
        window.dispatchEvent(new CustomEvent("highlights-updated"));
      } catch {
        // Non-critical: highlight sync can fail silently
      }
    },
    [transcriptionId, meetingId],
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
        section: "transcription",
        sourceId: transcriptionId,
        ...data,
      });
      window.dispatchEvent(new CustomEvent("highlights-updated"));
    },
    [meetingId, transcriptionId],
  );

  const handleHighlightRemove = useCallback(
    async (_fromPos: number, _toPos: number) => {
      // Positions will be resynced on next save via replaceHighlightsForSource
    },
    [],
  );

  return (
    <div className="transcription-view">
      <h3 className="transcription-heading">Transcription</h3>
      <RichTextEditor
        content={content}
        contentFormat={contentFormat}
        section="transcription"
        editable={editable}
        onSave={handleSave}
        onHighlightAdd={handleHighlightAdd}
        onHighlightRemove={handleHighlightRemove}
      />
    </div>
  );
}
