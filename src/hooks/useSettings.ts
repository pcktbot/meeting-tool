import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting, SETTINGS } from "../services/settings";
import type { AudioSource } from "../services/audio/types";

export function useSettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [audioSourceVal, setAudioSourceVal] = useState<AudioSource>("microphone");
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [key, source, deviceId] = await Promise.all([
        getSetting(SETTINGS.ANTHROPIC_API_KEY),
        getSetting(SETTINGS.AUDIO_SOURCE),
        getSetting(SETTINGS.MICROPHONE_DEVICE_ID),
      ]);
      setApiKey(key);
      setAudioSourceVal((source as AudioSource) || "microphone");
      setMicDeviceId(deviceId);
      setLoading(false);
    }
    load();
  }, []);

  const updateApiKey = useCallback(async (key: string) => {
    await setSetting(SETTINGS.ANTHROPIC_API_KEY, key);
    setApiKey(key);
  }, []);

  const setAudioSource = useCallback(async (source: AudioSource) => {
    await setSetting(SETTINGS.AUDIO_SOURCE, source);
    setAudioSourceVal(source);
  }, []);

  const setMicrophoneDeviceId = useCallback(async (deviceId: string) => {
    await setSetting(SETTINGS.MICROPHONE_DEVICE_ID, deviceId);
    setMicDeviceId(deviceId);
  }, []);

  return {
    apiKey,
    setApiKey: updateApiKey,
    audioSource: audioSourceVal,
    setAudioSource,
    microphoneDeviceId: micDeviceId,
    setMicrophoneDeviceId,
    loading,
  };
}
