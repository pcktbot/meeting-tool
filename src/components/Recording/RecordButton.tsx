import { useRecorder } from "../../hooks/useRecorder";
import { useNavigate } from "react-router-dom";
import { RecordingWaveform } from "./RecordingWaveform";
import { getSetting, SETTINGS } from "../../services/settings";
import type { AudioSource } from "../../services/audio/types";
import "./RecordButton.css";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordButton() {
  const {
    isRecording,
    duration,
    analyserNode,
    startRecording,
    stopRecording,
  } = useRecorder();
  const navigate = useNavigate();

  const handleClick = async () => {
    if (isRecording) {
      try {
        const result = await stopRecording();
        if (result) {
          navigate(`/meeting/${result.meeting.id}`);
        }
      } catch (err) {
        console.error("Failed to save recording:", err);
      }
    } else {
      try {
        const audioSource = (await getSetting(
          SETTINGS.AUDIO_SOURCE,
        )) as AudioSource | null;
        if (audioSource === "system" || audioSource === "both") {
          alert(
            "When the share picker opens, choose the screen or meeting app that has the call audio. Do not share the Meeting Tool window, because macOS usually will not provide system audio for it.",
          );
        }

        await startRecording();
      } catch (err) {
        console.error("Failed to start recording:", err);

        if (err instanceof Error && err.name === "NotAllowedError") {
          alert(
            "Recording permission was denied. In macOS System Settings > Privacy & Security, allow Meeting Transcriber to access Microphone and Screen Recording, then try again.",
          );
          return;
        }

        alert(
          err instanceof Error
            ? err.message
            : "Failed to start recording.",
        );
      }
    }
  };

  return (
    <div className="record-container">
      <button
        className={`record-btn ${isRecording ? "record-btn--recording" : ""}`}
        onClick={handleClick}
      >
        <span className="record-btn-icon">
          {isRecording ? "\u25A0" : "\u25CF"}
        </span>
        <span>{isRecording ? "Stop Recording" : "Record Meeting"}</span>
      </button>
      {isRecording && (
        <div className="record-status">
          <RecordingWaveform analyserNode={analyserNode} isRecording={isRecording} />
          <span className="record-duration">{formatDuration(duration)}</span>
        </div>
      )}
    </div>
  );
}
