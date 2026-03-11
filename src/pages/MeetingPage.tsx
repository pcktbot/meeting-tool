import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMeetingDetail } from "../hooks/useMeetings";
import { useTranscription } from "../hooks/useTranscription";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { updateMeetingTitle, deleteMeeting } from "../services/meetings";
import { confirm } from "@tauri-apps/plugin-dialog";
import { TranscriptionEditor } from "../components/Transcription/TranscriptionEditor";
import { TranscriptionProgress } from "../components/Transcription/TranscriptionProgress";
import { SummaryView } from "../components/Summary/SummaryView";
import { SummaryEditor } from "../components/Summary/SummaryEditor";
import { SummarizeButton } from "../components/Summary/SummarizeButton";
import { WaveformDisplay } from "../components/Audio/WaveformDisplay";
import "./MeetingPage.css";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { details, loading, refresh } = useMeetingDetail(id);
  const { transcribe, transcribing, progress, error: transcriptionError } =
    useTranscription();
  const [streamingSummary, setStreamingSummary] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const firstAudioFile = details?.audioFiles[0];
  const player = useAudioPlayer(
    firstAudioFile?.filePath,
    firstAudioFile?.duration ?? null,
  );

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

  const handleTitleClick = () => {
    setEditTitle(meeting.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = async () => {
    setIsEditingTitle(false);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === meeting.title) return;
    await updateMeetingTitle(meeting.id, trimmed);
    window.dispatchEvent(new CustomEvent("meetings-updated"));
    refresh();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleTitleSave();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm(
      "Delete this meeting? All recordings, transcriptions, and summaries will be permanently removed.",
      { title: "Delete Meeting", kind: "warning" },
    );
    if (!confirmed) return;
    await deleteMeeting(meeting.id);
    window.dispatchEvent(new CustomEvent("meetings-updated"));
    navigate("/");
  };

  const hasContent = transcription || summary;

  return (
    <div className="meeting-page">
      <div className="meeting-header">
        <div className="meeting-header-top">
          {isEditingTitle ? (
            <input
              className="meeting-title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleSave}
              autoFocus
            />
          ) : (
            <h2
              className="meeting-title meeting-title--editable"
              onClick={handleTitleClick}
            >
              {meeting.title}
            </h2>
          )}
          <div className="meeting-header-actions">
            {hasContent && (
              <button
                className={`meeting-mode-btn ${isEditMode ? "meeting-mode-btn--active" : ""}`}
                onClick={() => setIsEditMode(!isEditMode)}
              >
                {isEditMode ? "Done" : "Edit"}
              </button>
            )}
            <button
              className="meeting-delete-btn"
              onClick={handleDelete}
              disabled={transcribing}
            >
              Delete
            </button>
          </div>
        </div>
        <span className="meeting-date">
          {new Date(meeting.createdAt).toLocaleString()}
        </span>
      </div>

      {audioFile && (
        <div className="meeting-audio-info">
          {audioFile.waveformPeaks && (
            <WaveformDisplay
              peaks={JSON.parse(audioFile.waveformPeaks)}
              progress={
                player.duration > 0
                  ? player.currentTime / player.duration
                  : undefined
              }
              onSeek={player.seek}
            />
          )}
          <div className="audio-details-row">
            <div className="audio-playback-controls">
              <button
                className="play-pause-btn"
                onClick={player.toggle}
                disabled={player.isLoading}
              >
                {player.isLoading ? "..." : player.isPlaying ? "\u23F8" : "\u25B6"}
              </button>
              <span className="audio-time">
                {formatTime(player.currentTime)}
                {" / "}
                {formatTime(player.duration)}
              </span>
            </div>

            <div className="audio-details">
              <span>{audioFile.format.toUpperCase()}</span>
              <span>{formatBytes(audioFile.sizeBytes)}</span>
            </div>

            {!transcription && !transcribing && (
              <button className="transcribe-btn" onClick={handleTranscribe}>
                Transcribe
              </button>
            )}
          </div>
        </div>
      )}

      {transcribing && <TranscriptionProgress progress={progress} />}

      {transcriptionError && (
        <p className="meeting-error">{transcriptionError}</p>
      )}

      {transcription && (
        <>
          <TranscriptionEditor
            transcriptionId={transcription.id}
            meetingId={meeting.id}
            content={transcription.content}
            contentFormat={transcription.contentFormat ?? "plain"}
            editable={isEditMode}
          />

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

      {summary && (
        <SummaryEditor
          summaryId={summary.id}
          meetingId={meeting.id}
          content={summary.content}
          contentFormat={summary.contentFormat ?? "plain"}
          editable={isEditMode}
        />
      )}
    </div>
  );
}
