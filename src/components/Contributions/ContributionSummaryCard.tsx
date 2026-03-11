import type { ContributionSummary } from "../../services/contributions";
import "./ContributionSummaryCard.css";

interface ContributionSummaryCardProps {
  readonly summary: ContributionSummary;
}

export function ContributionSummaryCard({
  summary,
}: ContributionSummaryCardProps) {
  const entryIds: string[] = JSON.parse(summary.entryIds || "[]");
  const rangeLabel =
    summary.dateFrom === summary.dateTo
      ? summary.dateFrom
      : `${summary.dateFrom} — ${summary.dateTo}`;

  return (
    <div className="contrib-summary-card">
      <div className="contrib-summary-header">
        <span className="contrib-summary-badge">Summary</span>
        <span className="contrib-summary-range">{rangeLabel}</span>
        <span className="contrib-summary-count">
          {entryIds.length} {entryIds.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      <p className="contrib-summary-text">{summary.content}</p>
    </div>
  );
}
