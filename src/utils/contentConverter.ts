import type { JSONContent } from "@tiptap/react";

export function plainTextToTipTapDoc(text: string): JSONContent {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.trim() }],
    })),
  };
}

export function markdownLikeToTipTapDoc(text: string): JSONContent {
  const lines = text.split("\n");
  const content: JSONContent[] = [];
  let currentListItems: JSONContent[] = [];

  function flushList() {
    if (currentListItems.length > 0) {
      content.push({ type: "bulletList", content: currentListItems });
      currentListItems = [];
    }
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushList();
      content.push({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: line.slice(3) }],
      });
    } else if (line.startsWith("- ")) {
      currentListItems.push({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: line.slice(2) }],
          },
        ],
      });
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: line }],
      });
    }
  }

  flushList();

  if (content.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  return { type: "doc", content };
}

export function loadTipTapContent(
  rawContent: string,
  contentFormat: string,
  section: "transcription" | "summary" | "todo" | "entry",
): JSONContent {
  if (contentFormat === "tiptap_json") {
    try {
      return JSON.parse(rawContent);
    } catch {
      return plainTextToTipTapDoc(rawContent);
    }
  }

  if (section === "summary" || section === "todo") {
    return markdownLikeToTipTapDoc(rawContent);
  }

  return plainTextToTipTapDoc(rawContent);
}

export function tipTapDocToPlainText(content: JSONContent | null): string {
  if (!content) return "";

  if (content.type === "text") {
    return content.text || "";
  }

  const parts = (content.content || []).map((child) => tipTapDocToPlainText(child));
  const joined = parts.join(content.type === "paragraph" ? "" : "\n").trim();

  if (content.type === "paragraph" || content.type === "heading") {
    return joined;
  }

  if (content.type === "bulletList") {
    return (content.content || [])
      .map((child) => `- ${tipTapDocToPlainText(child).trim()}`)
      .join("\n");
  }

  if (content.type === "listItem") {
    return parts.join(" ").trim();
  }

  if (content.type === "doc") {
    return parts.filter(Boolean).join("\n\n");
  }

  return joined;
}

export function extractPlainText(
  rawContent: string,
  contentFormat: string,
): string {
  if (contentFormat !== "tiptap_json") {
    return rawContent;
  }

  try {
    return tipTapDocToPlainText(JSON.parse(rawContent));
  } catch {
    return rawContent;
  }
}
