import { useState, useCallback, useEffect } from "react";
import {
  getEntriesByDate,
  getSummariesForDate,
  getTodosForDate,
  type ContributionEntry,
  type ContributionSummary,
  type ContributionTodo,
} from "../services/contributions";

export function useDayData(date: string) {
  const [entries, setEntries] = useState<ContributionEntry[]>([]);
  const [summaries, setSummaries] = useState<ContributionSummary[]>([]);
  const [todos, setTodos] = useState<ContributionTodo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [e, s, t] = await Promise.all([
        getEntriesByDate(date),
        getSummariesForDate(date),
        getTodosForDate(date),
      ]);
      setEntries(e);
      setSummaries(s);
      setTodos(t);
    } catch (err) {
      console.error("Failed to load day data:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    globalThis.addEventListener("contributions-updated", handler);
    return () => globalThis.removeEventListener("contributions-updated", handler);
  }, [refresh]);

  return { entries, summaries, todos, loading };
}
