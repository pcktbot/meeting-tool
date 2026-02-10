import "./TranscriptionProgress.css";

interface TranscriptionProgressProps {
  progress: string;
}

export function TranscriptionProgress({
  progress,
}: TranscriptionProgressProps) {
  return (
    <div className="transcription-progress">
      <div className="progress-spinner" />
      <span className="progress-text">{progress}</span>
    </div>
  );
}
