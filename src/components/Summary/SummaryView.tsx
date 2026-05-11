import { marked } from "marked";
import "./SummaryView.css";

interface SummaryViewProps {
  content: string;
}

export function SummaryView({ content }: SummaryViewProps) {
  const html = marked(content) as string;

  return (
    <div className="summary-view">
      <h3 className="summary-heading">Summary</h3>
      <div
        className="summary-content markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
