import { useNavigate, useLocation } from "react-router-dom";
import { useMeetings } from "../../hooks/useMeetings";
import "./Sidebar.css";

export function Sidebar() {
  const { meetings, loading } = useMeetings();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">Meetings</h1>
        <button
          className="sidebar-settings-btn"
          onClick={() => navigate("/settings")}
          title="Settings"
        >
          &#9881;
        </button>
      </div>

      <button
        className="sidebar-home-btn"
        onClick={() => navigate("/")}
      >
        + New Meeting
      </button>

      <div className="sidebar-list">
        {loading && <p className="sidebar-loading">Loading...</p>}
        {!loading && meetings.length === 0 && (
          <p className="sidebar-empty">No meetings yet</p>
        )}
        {meetings.map((meeting) => (
          <button
            key={meeting.id}
            className={`sidebar-item ${
              location.pathname === `/meeting/${meeting.id}`
                ? "sidebar-item--active"
                : ""
            }`}
            onClick={() => navigate(`/meeting/${meeting.id}`)}
          >
            <span className="sidebar-item-title">{meeting.title}</span>
            <span className="sidebar-item-date">
              {new Date(meeting.createdAt).toLocaleDateString()}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
