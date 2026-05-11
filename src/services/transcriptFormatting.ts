import type { TranscriptionSegment } from "./transcription";

const PARAGRAPH_BREAK_PATTERN =
  /\b(?:paragraph break|new paragraph|next paragraph)\b[\s,.:;-]*/gi;
const LONG_PAUSE_MS = 1600;

function normalizeSegmentText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanupSpokenParagraphBreaks(text: string): string {
  return text
    .replace(PARAGRAPH_BREAK_PATTERN, "\n\n")
    .replace(/[ \t]*\n\n[ \t]*/g, "\n\n")
    .trim();
}

function shouldInsertParagraphBreak(
  previous: TranscriptionSegment,
  current: TranscriptionSegment,
): boolean {
  return current.start_ms - previous.end_ms >= LONG_PAUSE_MS;
}

export function formatTranscriptSegments(
  segments: TranscriptionSegment[],
): string {
  if (segments.length === 0) return "";

  let output = "";
  let previousSegment: TranscriptionSegment | null = null;

  for (const segment of segments) {
    const cleaned = cleanupSpokenParagraphBreaks(
      normalizeSegmentText(segment.text),
    );
    const paragraphRequested = PARAGRAPH_BREAK_PATTERN.test(segment.text);
    PARAGRAPH_BREAK_PATTERN.lastIndex = 0;

    if (!cleaned && !paragraphRequested) {
      previousSegment = segment;
      continue;
    }

    if (!output) {
      output = cleaned;
      previousSegment = segment;
      continue;
    }

    const wantsParagraph =
      paragraphRequested ||
      (previousSegment && shouldInsertParagraphBreak(previousSegment, segment));

    if (wantsParagraph) {
      output = `${output.trim()}\n\n${cleaned}`.trim();
    } else {
      output = `${output.trim()} ${cleaned}`.trim();
    }

    previousSegment = segment;
  }

  return output
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
