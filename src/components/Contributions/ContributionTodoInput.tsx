import { useCallback, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorToolbar } from "../Editor/EditorToolbar";
import "./ContributionTodoInput.css";

interface ContributionTodoInputProps {
  readonly onAdd: (content: string, contentFormat: string) => void;
}

export function ContributionTodoInput({ onAdd }: ContributionTodoInputProps) {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      setIsEmpty(ed.isEmpty);
    },
    editorProps: {
      attributes: {
        class: "contrib-todo-input-editor",
      },
    },
  });

  editorRef.current = editor;

  const submit = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || ed.isEmpty) return;
    onAdd(JSON.stringify(ed.getJSON()), "tiptap_json");
    ed.commands.clearContent();
    setIsEmpty(true);
  }, [onAdd]);

  if (!editor) return null;

  return (
    <div className="contrib-todo-input">
      <div className="contrib-todo-input-editor-wrap">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
      <button
        className="contrib-todo-input-btn"
        onClick={submit}
        disabled={isEmpty}
      >
        Add TODO
      </button>
    </div>
  );
}
