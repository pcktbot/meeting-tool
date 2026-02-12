import { useNavigate } from "react-router-dom";
import { useHighlights } from "../hooks/useHighlights";
import { HighlightCard } from "../components/Highlights/HighlightCard";
import "./HighlightsPage.css";

export function HighlightsPage() {
  const { highlights, loading, remove } = useHighlights();
  const navigate = useNavigate();

  if (loading) {
    return <div className="highlights-page-loading">Loading highlights...</div>;
  }

  return (
    <div className="highlights-page">
      <h2 className="highlights-page-title">Highlights</h2>

      {highlights.length === 0 ? (
        <p className="highlights-page-empty">
          No highlights yet. Select text in a meeting's transcription or summary
          to highlight it.
        </p>
      ) : (
        <div className="highlights-list">
          {highlights.map((h) => (
            <HighlightCard
              key={h.id}
              highlight={h}
              onNavigate={() => navigate(`/meeting/${h.meetingId}`)}
              onRemove={() => remove(h.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
