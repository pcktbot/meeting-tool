import Anthropic from "@anthropic-ai/sdk";

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

export { MEETING_SUMMARY_PROMPT };
