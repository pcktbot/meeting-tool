import { useCallback, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorToolbar } from "../Editor/EditorToolbar";
import { loadTipTapContent } from "../../utils/contentConverter";
import type { ContributionTodo } from "../../services/contributions";
import "./ContributionTodoCard.css";

interface ContributionTodoCardProps {
  readonly todo: ContributionTodo;
  readonly onUpdate: (id: string, content: string, contentFormat?: string) => Promise<void>;
  readonly onRemove: (id: string) => void;
  readonly readOnly?: boolean;
}

export function ContributionTodoCard({
  todo,
  onUpdate,
  onRemove,
  readOnly = false,
}: ContributionTodoCardProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const initialContent = useMemo(
    () => loadTipTapContent(todo.content, todo.contentFormat, "todo"),
    [todo.content, todo.contentFormat],
  );

  const linkedEntryCount = useMemo(() => {
    try {
      const parsed = JSON.parse(todo.entryIds || "[]") as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }, [todo.entryIds]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
    ],
    content: initialContent,
    editable: editing,
  });

  const rangeLabel =
    todo.dateFrom === todo.dateTo
      ? todo.dateFrom
      : `${todo.dateFrom} — ${todo.dateTo}`;

  const startEdit = useCallback(() => {
    setEditing(true);
    editor?.setEditable(true);
    editor?.commands.focus("end");
  }, [editor]);

  const save = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onUpdate(todo.id, JSON.stringify(editor.getJSON()), "tiptap_json");
      setEditing(false);
      editor.setEditable(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [editor, onUpdate, todo.id]);

  const cancel = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent(initialContent);
    setEditing(false);
    editor.setEditable(false);
  }, [editor, initialContent]);

  if (!editor) return null;

  return (
    <div className={`contrib-todo-card ${editing ? "contrib-todo-card--editing" : ""}`}>
      <div className="contrib-todo-header">
        <span className="contrib-todo-badge">Todo</span>
        <span className="contrib-todo-range">{rangeLabel}</span>
        {linkedEntryCount > 0 && (
          <span className="contrib-todo-count">
            {linkedEntryCount} {linkedEntryCount === 1 ? "entry" : "entries"}
          </span>
        )}
      </div>

      {editing && <EditorToolbar editor={editor} />}

      <div
        className={`contrib-todo-content ${!editing && !readOnly ? "contrib-todo-content--clickable" : ""}`}
      >
        {!editing && !readOnly && (
          <button
            type="button"
            className="contrib-todo-edit-overlay"
            onClick={startEdit}
            aria-label="Edit todo"
          />
        )}
        <EditorContent editor={editor} />
      </div>

      {!readOnly && (
        <div className="contrib-todo-footer">
          {editing ? (
            <div className="contrib-todo-actions">
              <button className="contrib-todo-save" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="contrib-todo-cancel" onClick={cancel} disabled={saving}>
                Cancel
              </button>
              {saveError && <span className="contrib-todo-error">{saveError}</span>}
            </div>
          ) : (
            <button
              className="contrib-todo-remove"
              onClick={() => onRemove(todo.id)}
              title="Remove todo"
            >
              &times;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
