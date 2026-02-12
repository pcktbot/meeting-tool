import { useState, useCallback, useEffect } from "react";
import {
  getAllHighlights,
  deleteHighlight,
  type HighlightWithMeeting,
} from "../services/highlights";

export function useHighlights() {
  const [highlights, setHighlights] = useState<HighlightWithMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllHighlights();
      setHighlights(data);
    } catch (err) {
      console.error("Failed to load highlights:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("highlights-updated", handler);
    return () => window.removeEventListener("highlights-updated", handler);
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await deleteHighlight(id);
      window.dispatchEvent(new CustomEvent("highlights-updated"));
    },
    [],
  );

  return { highlights, loading, refresh, remove };
}
