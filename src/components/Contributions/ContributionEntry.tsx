import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorToolbar } from "../Editor/EditorToolbar";
import { loadTipTapContent } from "../../utils/contentConverter";
import type { ContributionEntry as EntryType } from "../../services/contributions";
import "./ContributionEntry.css";

interface ContributionEntryProps {
  readonly entry: EntryType;
  readonly onUpdate: (id: string, content: string, contentFormat?: string) => void;
  readonly onRemove: (id: string) => void;
}

export function ContributionEntry({
  entry,
  onUpdate,
  onRemove,
}: ContributionEntryProps) {
  const [editing, setEditing] = useState(false);

  const initialContent = loadTipTapContent(
    entry.content,
    entry.contentFormat,
    "transcription",
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
    ],
    content: initialContent,
    editable: editing,
  });

  const startEdit = useCallback(() => {
    setEditing(true);
    editor?.setEditable(true);
    editor?.commands.focus("end");
  }, [editor]);

  const save = useCallback(() => {
    if (!editor) return;
    const json = editor.getJSON();
    onUpdate(entry.id, JSON.stringify(json), "tiptap_json");
    setEditing(false);
    editor.setEditable(false);
  }, [editor, entry.id, onUpdate]);

  const cancel = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(initialContent);
    setEditing(false);
    editor.setEditable(false);
  }, [editor, initialContent]);

  const time = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!editor) return null;

  return (
    <div className={`contrib-entry ${editing ? "contrib-entry--editing" : ""}`}>
      <span className="contrib-entry-time">{time}</span>
      <div className="contrib-entry-body">
        {editing && <EditorToolbar editor={editor} />}
        <div
          className={`contrib-entry-content ${editing ? "" : "contrib-entry-content--clickable"}`}
        >
          {!editing && (
            <button
              type="button"
              className="contrib-entry-edit-overlay"
              onClick={startEdit}
              aria-label="Edit entry"
            />
          )}
          <EditorContent editor={editor} />
        </div>
        {editing && (
          <div className="contrib-entry-actions">
            <button className="contrib-entry-save" onClick={save}>
              Save
            </button>
            <button className="contrib-entry-cancel" onClick={cancel}>
              Cancel
            </button>
          </div>
        )}
      </div>
      {!editing && (
        <button
          className="contrib-entry-remove"
          onClick={() => onRemove(entry.id)}
          title="Remove entry"
        >
          &times;
        </button>
      )}
    </div>
  );
}
