import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cleanupTextToTipTapDoc } from "../utils/contentConverter";
import { getSetting, SETTINGS, DEFAULT_CLAUDE_MODEL } from "./settings";

// Resolve the Claude model to use: an explicit argument wins, otherwise the
// user's saved Settings value, otherwise the built-in default.
async function resolveModel(model?: string): Promise<string> {
  if (model) return model;
  return (await getSetting(SETTINGS.CLAUDE_MODEL)) || DEFAULT_CLAUDE_MODEL;
}

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
  model?: string,
): Promise<string> {
  return invoke<string>("summarize_meeting", {
    apiKey,
    transcriptText: transcriptionText,
    model: await resolveModel(model),
  });
}

export async function summarizeWithStreaming(
  transcriptionText: string,
  apiKey: string,
  onChunk: (text: string) => void,
  model?: string,
): Promise<string> {
  const resolvedModel = await resolveModel(model);
  const unlisten = await listen<string>("anthropic-stream-chunk", (event) => {
    onChunk(event.payload);
  });

  try {
    return await invoke<string>("summarize_with_streaming", {
      apiKey,
      transcriptText: transcriptionText,
      model: resolvedModel,
    });
  } finally {
    unlisten();
  }
}

export async function cleanTranscript(
  transcriptText: string,
  apiKey: string,
  stylePrompt: string = "",
  model?: string,
): Promise<{ plainText: string; jsonContent: string }> {
  const plainText = await invoke<string>("clean_transcript", {
    apiKey,
    transcriptText,
    stylePrompt,
    model: await resolveModel(model),
  });

  const jsonContent = JSON.stringify(cleanupTextToTipTapDoc(plainText));
  return { plainText, jsonContent };
}

const CONTRIBUTIONS_SUMMARY_PROMPT = `You are summarizing a person's work log entries for a given date range. Produce a concise professional summary suitable for a performance review or status report.

Include:
## What I worked on
- Key themes, projects, and accomplishments

## Notable contributions
- Specific wins, completions, or impact items worth highlighting

## Patterns and focus areas
- Recurring topics or areas of concentration

Write in first person. Be specific but concise. Do not invent details — only use what is in the entries.

Entries:
`;

export async function summarizeContributions(
  entriesText: string,
  apiKey: string,
  model?: string,
): Promise<string> {
  return invoke<string>("claude_complete", {
    apiKey,
    userContent: CONTRIBUTIONS_SUMMARY_PROMPT + entriesText,
    system: null,
    model: await resolveModel(model),
  });
}

export { MEETING_SUMMARY_PROMPT, TRANSCRIPT_CLEANUP_PROMPT };
