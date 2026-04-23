import Anthropic from "@anthropic-ai/sdk";
import { cleanupTextToTipTapDoc } from "../utils/contentConverter";

const MEETING_SUMMARY_PROMPT = `You are a meeting summarization assistant. Given the following meeting transcription, produce a structured summary with these sections:

## Key Points
- List the main topics discussed and decisions made

## Action Items
- List any action items, tasks, or follow-ups mentioned, with assignees if stated

## Summary
A concise 2-3 paragraph summary of the meeting content.

## Participants
List any participants mentioned by name.

Transcription:
`;

const TRANSCRIPT_CLEANUP_PROMPT = `You are editing a raw meeting transcript for readability.

Rules:
- Preserve meaning.
- Do not summarize.
- Do not remove important details.
- Remove spoken formatting commands like "paragraph break" or "new paragraph".
- Improve punctuation and paragraph breaks.
- Keep uncertain or messy wording if the meaning is unclear rather than inventing details.
- Return only the cleaned transcript text.

Transcript:
`;

export async function summarizeMeeting(
  transcriptionText: string,
  apiKey: string,
  model: string = "claude-sonnet-4-20250514",
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: MEETING_SUMMARY_PROMPT + transcriptionText,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  return textBlock.text;
}

export async function summarizeWithStreaming(
  transcriptionText: string,
  apiKey: string,
  onChunk: (text: string) => void,
  model: string = "claude-sonnet-4-20250514",
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const stream = anthropic.messages.stream({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: MEETING_SUMMARY_PROMPT + transcriptionText,
      },
    ],
  });

  let fullText = "";

  stream.on("text", (text) => {
    fullText += text;
    onChunk(text);
  });

  await stream.finalMessage();
  return fullText;
}

export async function cleanTranscript(
  transcriptText: string,
  apiKey: string,
  stylePrompt: string = "",
  model: string = "claude-sonnet-4-20250514",
): Promise<{ plainText: string; jsonContent: string }> {
  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const systemPrompt = stylePrompt.trim()
    ? `Apply these style preferences while cleaning the transcript:\n${stylePrompt.trim()}`
    : undefined;

  const message = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: TRANSCRIPT_CLEANUP_PROMPT + transcriptText,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  const plainText = textBlock.text.trim();
  const jsonContent = JSON.stringify(cleanupTextToTipTapDoc(plainText));

  return { plainText, jsonContent };
}

export { MEETING_SUMMARY_PROMPT, TRANSCRIPT_CLEANUP_PROMPT };
