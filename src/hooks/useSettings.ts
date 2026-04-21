import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting, SETTINGS } from "../services/settings";
import type { AudioSource } from "../services/audio/types";
import {
  applyThemeSettings,
  getThemeSettings,
  updateThemeSetting,
  type ThemeSettings,
} from "../services/theme";

export function useSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [cleanupStylePrompt, setCleanupStylePrompt] = useState<string>("");
  const [audioSourceVal, setAudioSourceVal] = useState<AudioSource>("microphone");
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [audioRetentionDays, setAudioRetentionDays] = useState<string>("14");
  const [themeSettings, setThemeSettings] = useState<ThemeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [key, stylePrompt, source, deviceId, retentionDays, theme] = await Promise.all([
        getSetting(SETTINGS.ANTHROPIC_API_KEY),
        getSetting(SETTINGS.CLAUDE_CLEANUP_STYLE_PROMPT),
        getSetting(SETTINGS.AUDIO_SOURCE),
        getSetting(SETTINGS.MICROPHONE_DEVICE_ID),
        getSetting(SETTINGS.AUDIO_RETENTION_DAYS),
        getThemeSettings(),
      ]);
      setApiKey(key);
      setCleanupStylePrompt(stylePrompt || "");
      setAudioSourceVal((source as AudioSource) || "microphone");
      setMicDeviceId(deviceId);
      setAudioRetentionDays(retentionDays || "14");
      setThemeSettings(theme);
      applyThemeSettings(theme);
      setLoading(false);
    }
    load();
  }, []);

  const updateApiKey = useCallback(async (key: string) => {
    await setSetting(SETTINGS.ANTHROPIC_API_KEY, key);
    setApiKey(key);
  }, []);

  const updateCleanupStylePrompt = useCallback(async (prompt: string) => {
    await setSetting(SETTINGS.CLAUDE_CLEANUP_STYLE_PROMPT, prompt);
    setCleanupStylePrompt(prompt);
  }, []);

  const setAudioSource = useCallback(async (source: AudioSource) => {
    await setSetting(SETTINGS.AUDIO_SOURCE, source);
    setAudioSourceVal(source);
  }, []);

  const setMicrophoneDeviceId = useCallback(async (deviceId: string) => {
    await setSetting(SETTINGS.MICROPHONE_DEVICE_ID, deviceId);
    setMicDeviceId(deviceId);
  }, []);

  const updateAudioRetentionDays = useCallback(async (days: string) => {
    await setSetting(SETTINGS.AUDIO_RETENTION_DAYS, days);
    setAudioRetentionDays(days);
  }, []);

  const setThemeColor = useCallback(
    async (key: keyof ThemeSettings, value: string) => {
      const normalized = await updateThemeSetting(key, value);
      setThemeSettings((current) => ({
        ...(current ?? ({} as ThemeSettings)),
        [key]: normalized,
      }));
      return normalized;
    },
    [],
  );

  return {
    apiKey,
    setApiKey: updateApiKey,
    cleanupStylePrompt,
    setCleanupStylePrompt: updateCleanupStylePrompt,
    audioSource: audioSourceVal,
    setAudioSource,
    microphoneDeviceId: micDeviceId,
    setMicrophoneDeviceId,
    audioRetentionDays,
    setAudioRetentionDays: updateAudioRetentionDays,
    themeSettings,
    setThemeColor,
    loading,
  };
}
