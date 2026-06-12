import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useContributions } from "../hooks/useContributions";
import { useDayData } from "../hooks/useDayData";
import { ContributionEntry } from "../components/Contributions/ContributionEntry";
import { ContributionSummaryCard } from "../components/Contributions/ContributionSummaryCard";
import { ContributionInput } from "../components/Contributions/ContributionInput";
import { ContributionTodoInput } from "../components/Contributions/ContributionTodoInput";
import { ContributionTodoCard } from "../components/Contributions/ContributionTodoCard";
import { DiaryCapturePanel } from "../components/Contributions/DiaryCapturePanel";
import {
  getTeamsChatMessagesForDate,
  linkTeamsMessageToContribution,
  scanTeamsChats,
  type TeamsChatMessage,
} from "../services/teams";
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

function daysIncludingSelectedDate(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const selected = new Date(year, month - 1, day);
  const today = new Date();
  selected.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - selected.getTime();
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

export function ContributionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [teamsMessages, setTeamsMessages] = useState<TeamsChatMessage[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsStatus, setTeamsStatus] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    setTeamsLoading(true);
    getTeamsChatMessagesForDate(selectedDate)
      .then((messages) => {
        if (!cancelled) setTeamsMessages(messages);
      })
      .catch((err) => {
        console.error("Failed to load Teams messages:", err);
        if (!cancelled) setTeamsStatus("Could not load imported Teams messages.");
      })
      .finally(() => {
        if (!cancelled) setTeamsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const updateDate = (date: string) => {
    setSelectedDate(date);
    const next = new URLSearchParams(searchParams);
    next.set("date", date);
    next.delete("entry");
    setSearchParams(next, { replace: true });
  };

  const handleScanTeams = async () => {
    setTeamsLoading(true);
    setTeamsStatus(null);

    try {
      const result = await scanTeamsChats(daysIncludingSelectedDate(selectedDate));
      const messages = await getTeamsChatMessagesForDate(selectedDate);
      setTeamsMessages(messages);
      setTeamsStatus(
        `Teams scan imported ${result.imported} new sent message${result.imported === 1 ? "" : "s"} from ${result.scannedChats - result.skippedChats} readable chat${result.scannedChats - result.skippedChats === 1 ? "" : "s"}${result.skippedChats > 0 ? ` and skipped ${result.skippedChats} inaccessible chat${result.skippedChats === 1 ? "" : "s"}` : ""}.`,
      );
    } catch (err) {
      console.error("Failed to scan Teams chats:", err);
      setTeamsStatus(
        err instanceof Error ? err.message : "Teams scan failed.",
      );
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleLinkTeamsMessage = async (messageId: string) => {
    if (entries.length === 0) return;
    const targetEntry = entries[0];
    const updated = await linkTeamsMessageToContribution(messageId, targetEntry.id);
    setTeamsMessages((current) =>
      current.map((message) => (message.id === updated.id ? updated : message)),
    );
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

              <div className="contributions-teams">
                <div className="contributions-section-heading-row">
                  <h3 className="contributions-section-title">Teams Sent Messages</h3>
                  <button
                    className="contributions-secondary-btn"
                    onClick={handleScanTeams}
                    disabled={teamsLoading}
                    type="button"
                  >
                    {teamsLoading ? "Scanning..." : "Scan Chats"}
                  </button>
                </div>
                {teamsStatus && (
                  <p className="contributions-section-empty">{teamsStatus}</p>
                )}
                {teamsMessages.length === 0 ? (
                  <p className="contributions-section-empty">
                    No imported sent Teams chat messages for this date.
                  </p>
                ) : (
                  <div className="teams-message-list">
                    {teamsMessages.map((message) => (
                      <article key={message.id} className="teams-message-card">
                        <div className="teams-message-meta">
                          <span>{new Date(message.createdDateTime).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}</span>
                          <span>{message.chatTopic || message.chatType}</span>
                          {message.contributionEntryId && <span>Linked</span>}
                        </div>
                        <p className="teams-message-body">{message.bodyText}</p>
                        <div className="teams-message-actions">
                          {message.messageWebUrl && (
                            <a
                              className="teams-message-link"
                              href={message.messageWebUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Teams
                            </a>
                          )}
                          {entries.length > 0 && !message.contributionEntryId && (
                            <button
                              className="contributions-secondary-btn"
                              onClick={() => void handleLinkTeamsMessage(message.id)}
                              type="button"
                            >
                              Link to Entry
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

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
