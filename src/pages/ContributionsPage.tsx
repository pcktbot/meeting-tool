import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useContributions } from "../hooks/useContributions";
import { useDayData } from "../hooks/useDayData";
import { ContributionEntry } from "../components/Contributions/ContributionEntry";
import { ContributionSummaryCard } from "../components/Contributions/ContributionSummaryCard";
import { ContributionInput } from "../components/Contributions/ContributionInput";
import { ContributionTodoInput } from "../components/Contributions/ContributionTodoInput";
import { ContributionTodoCard } from "../components/Contributions/ContributionTodoCard";
import { DiaryCapturePanel } from "../components/Contributions/DiaryCapturePanel";
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

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
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
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    selectedDate,
    setSelectedDate,
    entries,
    summaries,
    todos,
    loading,
    addEntry,
    editEntry,
    removeEntry,
    addTodo,
    editTodo,
    removeTodo,
  } = useContributions();

  useEffect(() => {
    const date = searchParams.get("date");
    if (date && date !== selectedDate) {
      setSelectedDate(date);
    }
  }, [searchParams, selectedDate, setSelectedDate]);

  useEffect(() => {
    const entryId = searchParams.get("entry");
    if (!entryId) return;

    const element = document.getElementById(`entry-${entryId}`);
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [entries, searchParams]);

  const prevDate = shiftDate(selectedDate, -1);
  const {
    entries: prevEntries,
    summaries: prevSummaries,
    todos: prevTodos,
    loading: prevLoading,
  } = useDayData(prevDate);

  const isToday = selectedDate === todayDate();

  const updateDate = (date: string) => {
    setSelectedDate(date);
    const next = new URLSearchParams(searchParams);
    next.set("date", date);
    next.delete("entry");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="contributions-page">
      <div className="contributions-header">
        <div className="contributions-date-nav">
          <button
            className="contributions-date-btn"
            onClick={() => updateDate(shiftDate(selectedDate, -1))}
          >
            &larr;
          </button>
          <span className="contributions-date-label">
            {formatDisplayDate(selectedDate)}
          </span>
          <button
            className="contributions-date-btn"
            onClick={() => updateDate(shiftDate(selectedDate, 1))}
            disabled={isToday}
          >
            &rarr;
          </button>
          <button
            className="contributions-today-btn"
            onClick={() => updateDate(todayDate())}
            disabled={isToday}
          >
            Today
          </button>
        </div>
      </div>

      <div className="contributions-columns">
        {/* Left column: previous day (read-only context) */}
        <div className="contributions-col contributions-col--prev">
          <div className="contributions-col-date">{formatShortDate(prevDate)}</div>

          {prevLoading ? (
            <p className="contributions-loading">Loading…</p>
          ) : prevEntries.length === 0 && prevSummaries.length === 0 && prevTodos.length === 0 ? (
            <p className="contributions-empty">No entries for this day.</p>
          ) : (
            <>
              {prevEntries.length > 0 && (
                <div className="contributions-entries">
                  {prevEntries.map((entry) => (
                    <ContributionEntry
                      key={entry.id}
                      entry={entry}
                      onUpdate={editEntry}
                      onRemove={removeEntry}
                      readOnly
                    />
                  ))}
                </div>
              )}

              {prevSummaries.length > 0 && (
                <div className="contributions-summaries">
                  <h3 className="contributions-section-title">Summaries</h3>
                  {prevSummaries.map((s) => (
                    <ContributionSummaryCard key={s.id} summary={s} />
                  ))}
                </div>
              )}

              {prevTodos.length > 0 && (
                <div className="contributions-todos">
                  <h3 className="contributions-section-title">Todos</h3>
                  {prevTodos.map((todo) => (
                    <ContributionTodoCard
                      key={todo.id}
                      todo={todo}
                      onUpdate={editTodo}
                      onRemove={removeTodo}
                      readOnly
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right column: selected day (active) */}
        <div className="contributions-col contributions-col--current">
          <div className="contributions-col-date">
            {isToday ? "Today" : formatShortDate(selectedDate)}
          </div>

          <DiaryCapturePanel
            selectedDate={selectedDate}
            onEntryCreated={addEntry}
          />

          {loading ? (
            <p className="contributions-loading">Loading…</p>
          ) : (
            <>
              {entries.length === 0 && <ContributionInput onAdd={addEntry} />}

              {entries.length === 0 && summaries.length === 0 && todos.length === 0 && (
                <p className="contributions-empty">
                  No entries, summaries, or todos for this day yet.
                </p>
              )}

              {entries.length > 0 && (
                <div className="contributions-entries">
                  {entries.map((entry) => (
                    <div key={entry.id} id={`entry-${entry.id}`}>
                      <ContributionEntry
                        entry={entry}
                        onUpdate={editEntry}
                        onRemove={removeEntry}
                      />
                    </div>
                  ))}
                </div>
              )}

              {summaries.length > 0 && (
                <div className="contributions-summaries">
                  <h3 className="contributions-section-title">Summaries</h3>
                  {summaries.map((s) => (
                    <ContributionSummaryCard key={s.id} summary={s} />
                  ))}
                </div>
              )}

              <div className="contributions-todos">
                <h3 className="contributions-section-title">Todos</h3>
                <ContributionTodoInput onAdd={addTodo} />
                {todos.length === 0 ? (
                  <p className="contributions-section-empty">
                    No captured next steps or ideas for this date.
                  </p>
                ) : (
                  todos.map((todo) => (
                    <ContributionTodoCard
                      key={todo.id}
                      todo={todo}
                      onUpdate={editTodo}
                      onRemove={removeTodo}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
