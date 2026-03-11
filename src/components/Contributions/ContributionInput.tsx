import { useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorToolbar } from "../Editor/EditorToolbar";
import "./ContributionInput.css";

interface ContributionInputProps {
  readonly onAdd: (content: string, contentFormat: string) => void;
}

export function ContributionInput({ onAdd }: ContributionInputProps) {
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "contrib-input-editor",
      },
    },
  });

  // Keep ref in sync for submit handler
  editorRef.current = editor;

  const submit = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || ed.isEmpty) return;
    const json = ed.getJSON();
    onAdd(JSON.stringify(json), "tiptap_json");
    ed.commands.clearContent();
  }, [onAdd]);

  if (!editor) return null;

  return (
    <div className="contrib-input">
      <div className="contrib-input-editor-wrap">
        <EditorToolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
      <button
        className="contrib-input-btn"
        onClick={submit}
        disabled={editor.isEmpty}
      >
        Add
      </button>
    </div>
  );
}
