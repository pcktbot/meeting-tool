import { useState, useCallback, useEffect } from "react";
import {
  getAllHighlights,
  deleteHighlight,
  deleteContributionHighlight,
  type HighlightListItem,
} from "../services/highlights";

export function useHighlights() {
  const [highlights, setHighlights] = useState<HighlightListItem[]>([]);
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
    window.addEventListener("app-refresh", handler);
    return () => {
      window.removeEventListener("highlights-updated", handler);
      window.removeEventListener("app-refresh", handler);
    };
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      const existing = highlights.find((item) => item.id === id);
      if (!existing) return;

      if (existing.targetType === "contribution") {
        await deleteContributionHighlight(id);
      } else {
        await deleteHighlight(id);
      }
      window.dispatchEvent(new CustomEvent("highlights-updated"));
    },
    [highlights],
  );

  return { highlights, loading, refresh, remove };
}
