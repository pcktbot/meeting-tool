import { useEditor, EditorContent, mergeAttributes } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { EditorToolbar } from "./EditorToolbar";
import { HighlightColorPicker } from "./HighlightColorPicker";
import { loadTipTapContent } from "../../utils/contentConverter";
import type { JSONContent, Editor as TiptapEditor } from "@tiptap/react";
import type { EditorState } from "@tiptap/pm/state";
import "./RichTextEditor.css";

// Custom highlight extension that uses data-color attribute without inline styles
const CustomHighlight = Highlight.extend({
  renderHTML({ mark }) {
    const color = mark.attrs.color;
    // Merge with configured HTMLAttributes, add data-color, skip inline style
    const attrs = mergeAttributes(this.options.HTMLAttributes, {
      "data-color": color,
    });
    return ["mark", attrs, 0];
  },
});

export const HIGHLIGHT_COLORS = [
  { name: "yellow", label: "Yellow" },
  { name: "green", label: "Green" },
  { name: "pink", label: "Pink" },
  { name: "blue", label: "Blue" },
  { name: "purple", label: "Purple" },
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]["name"];

interface RichTextEditorProps {
  content: string;
  contentFormat: string;
  section: "transcription" | "summary" | "entry";
  editable: boolean;
  onSave?: (jsonContent: string) => Promise<void>;
  onShortcutSave?: () => void;
  onHighlightAdd?: (data: {
    color: string;
    textContent: string;
    fromPos: number;
    toPos: number;
  }) => Promise<void>;
  onHighlightRemove?: (fromPos: number, toPos: number) => Promise<void>;
}

export function RichTextEditor({
  content,
  contentFormat,
  section,
  editable,
  onSave,
  onShortcutSave,
  onHighlightAdd,
  onHighlightRemove,
}: RichTextEditorProps) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAppliedContentRef = useRef<string | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const initialContent = useMemo(
    () => loadTipTapContent(content, contentFormat, section),
    [content, contentFormat, section],
  );
  const serializedInitialContent = useMemo(
    () => JSON.stringify(initialContent),
    [initialContent],
  );

  const flushSave = useCallback(async () => {
    if (!editorRef.current || !onSave) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const json = editorRef.current.getJSON();
    await onSave(JSON.stringify(json));
  }, [onSave]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      CustomHighlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: "brush-highlight",
        },
      }),
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor }) => {
      if (!editable || !onSave) return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const json = editor.getJSON();
        onSave(JSON.stringify(json));
      }, 1000);
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (!editable || !onSave) return false;

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void flushSave().then(() => {
            onShortcutSave?.();
          });
          return true;
        }

        return false;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    if (lastAppliedContentRef.current === serializedInitialContent) {
      return;
    }

    const currentContent = JSON.stringify(editor.getJSON());
    if (currentContent === serializedInitialContent) {
      lastAppliedContentRef.current = serializedInitialContent;
      return;
    }

    editor.commands.setContent(initialContent, { emitUpdate: false });
    lastAppliedContentRef.current = serializedInitialContent;
  }, [editor, initialContent, serializedInitialContent]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleHighlightColor = useCallback(
    async (color: string) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;

      const textContent = editor.state.doc.textBetween(from, to);

      // Temporarily enable editing to apply the mark
      const wasEditable = editor.isEditable;
      if (!wasEditable) {
        editor.setEditable(true);
      }

      editor.chain().focus().setHighlight({ color }).run();

      if (!wasEditable) {
        editor.setEditable(false);
      }

      if (onHighlightAdd) {
        await onHighlightAdd({ color, textContent, fromPos: from, toPos: to });
      }

      // Save the document with the highlight mark
      if (onSave) {
        const json = editor.getJSON();
        await onSave(JSON.stringify(json));
      }
    },
    [editor, onHighlightAdd, onSave],
  );

  const handleHighlightRemove = useCallback(async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;

    const wasEditable = editor.isEditable;
    if (!wasEditable) {
      editor.setEditable(true);
    }

    editor.chain().focus().unsetHighlight().run();

    if (!wasEditable) {
      editor.setEditable(false);
    }

    if (onHighlightRemove) {
      await onHighlightRemove(from, to);
    }

    if (onSave) {
      const json = editor.getJSON();
      await onSave(JSON.stringify(json));
    }
  }, [editor, onHighlightRemove, onSave]);

  const isInsideHighlight = useCallback((): boolean => {
    if (!editor) return false;
    return editor.isActive("highlight");
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={`rich-text-editor ${editable ? "rich-text-editor--editable" : "rich-text-editor--readonly"}`}>
      {editable && <EditorToolbar editor={editor} />}

      {!editable && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e, state: s }: { editor: TiptapEditor; state: EditorState }) => {
            const { from, to } = s.selection;
            return from !== to && !e.isEditable;
          }}
        >
          <HighlightColorPicker
            onSelectColor={handleHighlightColor}
            onRemove={handleHighlightRemove}
            showRemove={isInsideHighlight()}
          />
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}

export function extractHighlightsFromDoc(doc: JSONContent): {
  color: string;
  textContent: string;
  fromPos: number;
  toPos: number;
}[] {
  const highlights: {
    color: string;
    textContent: string;
    fromPos: number;
    toPos: number;
  }[] = [];

  function walk(node: JSONContent, pos: number) {
    if (node.type === "text" && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === "highlight" && mark.attrs?.color) {
          highlights.push({
            color: mark.attrs.color,
            textContent: node.text || "",
            fromPos: pos,
            toPos: pos + (node.text?.length || 0),
          });
        }
      }
    }

    if (node.content) {
      let offset = node.type === "doc" ? 0 : 1; // doc doesn't add offset, others do
      for (const child of node.content) {
        walk(child, pos + offset);
        if (child.type === "text") {
          offset += child.text?.length || 0;
        } else {
          // Non-text nodes take nodeSize = content size + 2 (open + close tags)
          offset += getNodeSize(child);
        }
      }
    }
  }

  walk(doc, 0);
  return highlights;
}

function getNodeSize(node: JSONContent): number {
  if (node.type === "text") return node.text?.length || 0;
  let size = 2; // opening + closing
  if (node.content) {
    for (const child of node.content) {
      size += getNodeSize(child);
    }
  }
  return size;
}
