import "./SummaryView.css";

interface SummaryViewProps {
  content: string;
}

export function SummaryView({ content }: SummaryViewProps) {
  // Simple markdown-like rendering for ## headers and - lists
  const lines = content.split("\n");

  return (
    <div className="summary-view">
      <h3 className="summary-heading">Summary</h3>
      <div className="summary-content">
        {lines.map((line, i) => {
          if (line.startsWith("## ")) {
            return (
              <h4 key={i} className="summary-section-title">
                {line.slice(3)}
              </h4>
            );
          }
          if (line.startsWith("- ")) {
            return (
              <li key={i} className="summary-list-item">
                {line.slice(2)}
              </li>
            );
          }
          if (line.trim() === "") {
            return <br key={i} />;
          }
          return (
            <p key={i} className="summary-paragraph">
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}
