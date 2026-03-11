import { useContributions } from "../hooks/useContributions";
import { ContributionEntry } from "../components/Contributions/ContributionEntry";
import { ContributionSummaryCard } from "../components/Contributions/ContributionSummaryCard";
import { ContributionInput } from "../components/Contributions/ContributionInput";
import "./ContributionsPage.css";

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ContributionsPage() {
  const {
    selectedDate,
    setSelectedDate,
    entries,
    summaries,
    loading,
    addEntry,
    editEntry,
    removeEntry,
  } = useContributions();

  const isToday = selectedDate === todayDate();

  return (
    <div className="contributions-page">
      <h2 className="contributions-page-title">Contributions</h2>

      <div className="contributions-date-nav">
        <button
          className="contributions-date-btn"
          onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
        >
          &larr;
        </button>
        <span className="contributions-date-label">
          {formatDisplayDate(selectedDate)}
        </span>
        <button
          className="contributions-date-btn"
          onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
          disabled={isToday}
        >
          &rarr;
        </button>
        {!isToday && (
          <button
            className="contributions-today-btn"
            onClick={() => setSelectedDate(todayDate())}
          >
            Today
          </button>
        )}
      </div>

      <ContributionInput onAdd={addEntry} />

      {loading ? (
        <p className="contributions-loading">Loading...</p>
      ) : (
        <>
          {entries.length === 0 && summaries.length === 0 ? (
            <p className="contributions-empty">
              No entries for this day. Add something above.
            </p>
          ) : (
            <>
              <div className="contributions-entries">
                {entries.map((entry) => (
                  <ContributionEntry
                    key={entry.id}
                    entry={entry}
                    onUpdate={editEntry}
                    onRemove={removeEntry}
                  />
                ))}
              </div>

              {summaries.length > 0 && (
                <div className="contributions-summaries">
                  <h3 className="contributions-section-title">Summaries</h3>
                  {summaries.map((s) => (
                    <ContributionSummaryCard key={s.id} summary={s} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
