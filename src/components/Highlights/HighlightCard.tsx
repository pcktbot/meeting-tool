import type { HighlightListItem } from "../../services/highlights";
import "./HighlightCard.css";

interface HighlightCardProps {
  highlight: HighlightListItem;
  onNavigate: () => void;
  onRemove: () => void;
}

export function HighlightCard({
  highlight,
  onNavigate,
  onRemove,
}: HighlightCardProps) {
  return (
    <div className="highlight-card" onClick={onNavigate}>
      <div className="highlight-card-top">
        <span
          className={`highlight-card-color highlight-card-color--${highlight.color}`}
        />
        <span className="highlight-card-section">{highlight.section}</span>
        <span className="highlight-card-date">
          {new Date(highlight.createdAt).toLocaleDateString()}
        </span>
        <button
          className="highlight-card-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove highlight"
        >
          &times;
        </button>
      </div>
      <p className={`highlight-card-text highlight-card-text--${highlight.color}`}>
        {highlight.textContent}
      </p>
      <span className="highlight-card-meeting">{highlight.targetLabel}</span>
    </div>
  );
}
