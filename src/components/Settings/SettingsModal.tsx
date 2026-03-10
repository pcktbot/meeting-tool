import { useState, useEffect } from "react";
import { useSettings } from "../../hooks/useSettings";
import { getAvailableMicrophones } from "../../services/audio/recorder";
import type { AudioSource } from "../../services/audio/types";
import "./SettingsModal.css";

export function SettingsForm() {
  const {
    apiKey,
    setApiKey,
    audioSource,
    setAudioSource,
    microphoneDeviceId,
    setMicrophoneDeviceId,
    loading,
  } = useSettings();
  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (apiKey) {
      setKeyInput(apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    getAvailableMicrophones().then(setMicrophones).catch(console.error);
  }, []);

  const handleSave = async () => {
    await setApiKey(keyInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAudioSourceChange = async (source: AudioSource) => {
    await setAudioSource(source);
  };

  const handleMicrophoneChange = async (deviceId: string) => {
    await setMicrophoneDeviceId(deviceId);
  };

  if (loading) return <p>Loading settings...</p>;

  return (
    <div className="settings-form">
      <div className="settings-section">
        <h3 className="settings-section-title">Audio Recording</h3>
        
        <div className="settings-field">
          <span className="settings-label" id="audio-source-label">Audio Source</span>
          <div className="settings-radio-group" role="radiogroup" aria-labelledby="audio-source-label">
            <label className="settings-radio">
              <input
                type="radio"
                name="audioSource"
                value="microphone"
                checked={audioSource === "microphone"}
                onChange={() => handleAudioSourceChange("microphone")}
              />
              <span>Microphone only</span>
            </label>
            <label className="settings-radio">
              <input
                type="radio"
                name="audioSource"
                value="system"
                checked={audioSource === "system"}
                onChange={() => handleAudioSourceChange("system")}
              />
              <span>System audio only</span>
            </label>
            <label className="settings-radio">
              <input
                type="radio"
                name="audioSource"
                value="both"
                checked={audioSource === "both"}
                onChange={() => handleAudioSourceChange("both")}
              />
              <span>Both (mic + system)</span>
            </label>
          </div>
          <p className="settings-hint">
            {audioSource === "microphone" && "Records from your microphone."}
            {audioSource === "system" && "Records system/call audio. You'll need to grant screen recording permission."}
            {audioSource === "both" && "Records both microphone and system audio together."}
          </p>
        </div>

        {(audioSource === "microphone" || audioSource === "both") && microphones.length > 0 && (
          <div className="settings-field">
            <label className="settings-label" htmlFor="microphone-select">
              Microphone
            </label>
            <select
              id="microphone-select"
              className="settings-select"
              value={microphoneDeviceId || ""}
              onChange={(e) => handleMicrophoneChange(e.target.value)}
            >
              <option value="">Default microphone</option>
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">AI Integration</h3>
        <div className="settings-field">
          <label className="settings-label" htmlFor="api-key">
            Anthropic API Key
          </label>
          <input
            id="api-key"
            type="password"
            className="settings-input"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="sk-ant-..."
          />
          <p className="settings-hint">
            Required for meeting summarization. Get your key from
            console.anthropic.com
          </p>
        </div>
      </div>

      <button className="settings-save-btn" onClick={handleSave}>
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
