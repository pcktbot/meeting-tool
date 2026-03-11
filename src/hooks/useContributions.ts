import { useState, useCallback, useEffect } from "react";
import {
  getEntriesByDate,
  getSummariesForDate,
  createEntry,
  updateEntry,
  deleteEntry,
  type ContributionEntry,
  type ContributionSummary,
} from "../services/contributions";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useContributions() {
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [entries, setEntries] = useState<ContributionEntry[]>([]);
  const [summaries, setSummaries] = useState<ContributionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([
        getEntriesByDate(selectedDate),
        getSummariesForDate(selectedDate),
      ]);
      setEntries(e);
      setSummaries(s);
    } catch (err) {
      console.error("Failed to load contributions:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    globalThis.addEventListener("contributions-updated", handler);
    return () => globalThis.removeEventListener("contributions-updated", handler);
  }, [refresh]);

  const addEntry = useCallback(
    async (content: string, contentFormat: string = "plain") => {
      await createEntry(content, selectedDate, contentFormat);
      globalThis.dispatchEvent(new CustomEvent("contributions-updated"));
    },
    [selectedDate],
  );

  const editEntry = useCallback(
    async (id: string, content: string, contentFormat?: string) => {
      await updateEntry(id, content, contentFormat);
      globalThis.dispatchEvent(new CustomEvent("contributions-updated"));
    },
    [],
  );

  const removeEntry = useCallback(async (id: string) => {
    await deleteEntry(id);
    globalThis.dispatchEvent(new CustomEvent("contributions-updated"));
  }, []);

  return {
    selectedDate,
    setSelectedDate,
    entries,
    summaries,
    loading,
    refresh,
    addEntry,
    editEntry,
    removeEntry,
  };
}
