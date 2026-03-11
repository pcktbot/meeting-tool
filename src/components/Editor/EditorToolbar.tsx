import type { Editor } from "@tiptap/react";
import "./EditorToolbar.css";

interface EditorToolbarProps {
  editor: Editor;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <button
        className={`toolbar-btn ${editor.isActive("bold") ? "toolbar-btn--active" : ""}`}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        className={`toolbar-btn ${editor.isActive("italic") ? "toolbar-btn--active" : ""}`}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <em>I</em>
      </button>

      <span className="toolbar-divider" />

      <button
        className={`toolbar-btn ${editor.isActive("heading", { level: 2 }) ? "toolbar-btn--active" : ""}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        H2
      </button>
      <button
        className={`toolbar-btn ${editor.isActive("heading", { level: 3 }) ? "toolbar-btn--active" : ""}`}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        H3
      </button>

      <span className="toolbar-divider" />

      <button
        className={`toolbar-btn ${editor.isActive("bulletList") ? "toolbar-btn--active" : ""}`}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        &bull; List
      </button>
      <button
        className={`toolbar-btn ${editor.isActive("orderedList") ? "toolbar-btn--active" : ""}`}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered List"
      >
        1. List
      </button>
    </div>
  );
}
