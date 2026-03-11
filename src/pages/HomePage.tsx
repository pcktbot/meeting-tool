import { useNavigate } from "react-router-dom";
import { confirm } from "@tauri-apps/plugin-dialog";
import { RecordButton } from "../components/Recording/RecordButton";
import { ImportButton } from "../components/Recording/ImportButton";
import { useMeetings } from "../hooks/useMeetings";
import "./HomePage.css";

export function HomePage() {
  const { meetings, loading, remove } = useMeetings();
  const navigate = useNavigate();

  const handleDelete = async (id: string, title: string) => {
    const confirmed = await confirm(`Delete "${title}"?`, {
      title: "Delete Meeting",
      kind: "warning",
    });
    if (!confirmed) return;
    await remove(id);
  };

  return (
    <div className="home-page">
      <div className="home-hero">
        <h2>Meeting Transcriber</h2>
        <p className="home-subtitle">
          Record or import audio, transcribe locally, and summarize with AI.
        </p>
        <div className="home-actions">
          <RecordButton />
          <ImportButton />
        </div>
      </div>

      <div className="home-meetings">
        <h3 className="home-meetings-title">Recent Meetings</h3>
        {loading && <p className="home-meetings-empty">Loading...</p>}
        {!loading && meetings.length === 0 && (
          <p className="home-meetings-empty">No meetings yet</p>
        )}
        <div className="home-meetings-list">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="home-meeting-item">
              <button
                className="home-meeting-link"
                onClick={() => navigate(`/meeting/${meeting.id}`)}
              >
                <span className="home-meeting-title">{meeting.title}</span>
                <span className="home-meeting-date">
                  {new Date(meeting.createdAt).toLocaleDateString()}
                </span>
              </button>
              <button
                className="home-meeting-delete"
                onClick={() => handleDelete(meeting.id, meeting.title)}
                title="Delete meeting"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
