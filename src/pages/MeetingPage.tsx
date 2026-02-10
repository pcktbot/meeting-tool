import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMeetingDetail } from "../hooks/useMeetings";
import { useTranscription } from "../hooks/useTranscription";
import { TranscriptionView } from "../components/Transcription/TranscriptionView";
import { TranscriptionProgress } from "../components/Transcription/TranscriptionProgress";
import { SummaryView } from "../components/Summary/SummaryView";
import { SummarizeButton } from "../components/Summary/SummarizeButton";
import "./MeetingPage.css";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown duration";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { details, loading, refresh } = useMeetingDetail(id);
  const { transcribe, transcribing, progress, error: transcriptionError } =
    useTranscription();
  const [streamingSummary, setStreamingSummary] = useState("");

  if (loading) {
    return <div className="meeting-page-loading">Loading meeting...</div>;
  }

  if (!details) {
    return <div className="meeting-page-empty">Meeting not found.</div>;
  }

  const { meeting, audioFiles, transcriptions, summaries } = details;
  const audioFile = audioFiles[0];
  const transcription = transcriptions[0];
  const summary = summaries[0];

  const handleTranscribe = async () => {
    if (!audioFile) return;
    await transcribe(meeting.id, audioFile.id, audioFile.filePath);
    refresh();
  };

  return (
    <div className="meeting-page">
      <div className="meeting-header">
        <h2 className="meeting-title">{meeting.title}</h2>
        <span className="meeting-date">
          {new Date(meeting.createdAt).toLocaleString()}
        </span>
      </div>

      {audioFile && (
        <div className="meeting-audio-info">
          <div className="audio-details">
            <span>Format: {audioFile.format.toUpperCase()}</span>
            <span>Size: {formatBytes(audioFile.sizeBytes)}</span>
            {audioFile.duration && (
              <span>Duration: {formatDuration(audioFile.duration)}</span>
            )}
          </div>

          {!transcription && !transcribing && (
            <button className="transcribe-btn" onClick={handleTranscribe}>
              Transcribe
            </button>
          )}
        </div>
      )}

      {transcribing && <TranscriptionProgress progress={progress} />}

      {transcriptionError && (
        <p className="meeting-error">{transcriptionError}</p>
      )}

      {transcription && (
        <>
          <TranscriptionView content={transcription.content} />

          {!summary && !streamingSummary && (
            <SummarizeButton
              meetingId={meeting.id}
              transcriptionId={transcription.id}
              transcriptionContent={transcription.content}
              onSummaryComplete={() => {
                setStreamingSummary("");
                refresh();
              }}
              onStreamChunk={(chunk) => {
                setStreamingSummary((prev) => prev + chunk);
              }}
            />
          )}
        </>
      )}

      {streamingSummary && !summary && (
        <SummaryView content={streamingSummary} />
      )}

      {summary && <SummaryView content={summary.content} />}
    </div>
  );
}
