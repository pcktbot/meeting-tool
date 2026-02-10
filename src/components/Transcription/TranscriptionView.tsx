import "./TranscriptionView.css";

interface TranscriptionViewProps {
  content: string;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptionView({ content }: TranscriptionViewProps) {
  return (
    <div className="transcription-view">
      <h3 className="transcription-heading">Transcription</h3>
      <div className="transcription-content">
        <p>{content}</p>
      </div>
    </div>
  );
}

interface TranscriptionSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export function TranscriptionSegmentsView({
  segments,
}: {
  segments: TranscriptionSegment[];
}) {
  return (
    <div className="transcription-view">
      <h3 className="transcription-heading">Transcription</h3>
      <div className="transcription-segments">
        {segments.map((segment, i) => (
          <div key={i} className="transcription-segment">
            <span className="segment-timestamp">
              [{formatTimestamp(segment.start_ms)}]
            </span>
            <span className="segment-text">{segment.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
