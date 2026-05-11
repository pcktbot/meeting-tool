import { useState, useCallback, useEffect } from "react";
import {
  getEntriesByDate,
  getSummariesForDate,
  getTodosForDate,
  createEntry,
  createTodo,
  updateEntry,
  updateTodo,
  deleteEntry,
  deleteTodo,
  type ContributionEntry,
  type ContributionEntryAudioInput,
  type ContributionSummary,
  type ContributionTodo,
} from "../services/contributions";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useContributions() {
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [entries, setEntries] = useState<ContributionEntry[]>([]);
  const [summaries, setSummaries] = useState<ContributionSummary[]>([]);
  const [todos, setTodos] = useState<ContributionTodo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [e, s, t] = await Promise.all([
        getEntriesByDate(selectedDate),
        getSummariesForDate(selectedDate),
        getTodosForDate(selectedDate),
      ]);
      setEntries(e);
      setSummaries(s);
      setTodos(t);
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
    globalThis.addEventListener("app-refresh", handler);
    return () => {
      globalThis.removeEventListener("contributions-updated", handler);
      globalThis.removeEventListener("app-refresh", handler);
    };
  }, [refresh]);

  const addEntry = useCallback(
    async (
      content: string,
      contentFormat: string = "plain",
      audio?: ContributionEntryAudioInput | null,
    ) => {
      await createEntry(content, selectedDate, contentFormat, audio);
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

  const addTodo = useCallback(
    async (
      content: string,
      contentFormat: string = "plain",
      dateFrom: string = selectedDate,
      dateTo: string = selectedDate,
      entryIds: string[] = [],
    ) => {
      await createTodo(content, dateFrom, dateTo, entryIds, contentFormat);
      globalThis.dispatchEvent(new CustomEvent("contributions-updated"));
    },
    [selectedDate],
  );

  const editTodo = useCallback(
    async (id: string, content: string, contentFormat?: string) => {
      await updateTodo(id, content, contentFormat);
      globalThis.dispatchEvent(new CustomEvent("contributions-updated"));
    },
    [],
  );

  const removeTodo = useCallback(async (id: string) => {
    await deleteTodo(id);
    globalThis.dispatchEvent(new CustomEvent("contributions-updated"));
  }, []);

  return {
    selectedDate,
    setSelectedDate,
    entries,
    summaries,
    todos,
    loading,
    refresh,
    addEntry,
    editEntry,
    removeEntry,
    addTodo,
    editTodo,
    removeTodo,
  };
}
