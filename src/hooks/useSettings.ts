import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting, SETTINGS } from "../services/settings";

export function useSettings() {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const key = await getSetting(SETTINGS.ANTHROPIC_API_KEY);
      setApiKeyState(key);
      setLoading(false);
    }
    load();
  }, []);

  const setApiKey = useCallback(async (key: string) => {
    await setSetting(SETTINGS.ANTHROPIC_API_KEY, key);
    setApiKeyState(key);
  }, []);

  return { apiKey, setApiKey, loading };
}
