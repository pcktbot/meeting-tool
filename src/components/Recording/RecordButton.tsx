import { useRecorder } from "../../hooks/useRecorder";
import { useNavigate } from "react-router-dom";
import { AudioVisualizer } from "./AudioVisualizer";
import "./RecordButton.css";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordButton() {
  const { isRecording, duration, audioLevel, startRecording, stopRecording } =
    useRecorder();
  const navigate = useNavigate();

  const handleClick = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        navigate(`/meeting/${result.meeting.id}`);
      }
    } else {
      await startRecording();
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
          <AudioVisualizer level={audioLevel} />
          <span className="record-duration">{formatDuration(duration)}</span>
        </div>
      )}
    </div>
  );
}
