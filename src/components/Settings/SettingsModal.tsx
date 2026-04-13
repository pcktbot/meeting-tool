import { useState, useEffect } from "react";
import { useSettings } from "../../hooks/useSettings";
import { getAvailableMicrophones } from "../../services/audio/recorder";
import type { AudioSource } from "../../services/audio/types";
import {
  getLastTextBackupDate,
  getTextBackupDirectory,
  openTextBackupDirectory,
  runTextBackupNow,
} from "../../services/backups";
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
  const [backupDir, setBackupDir] = useState("");
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (apiKey) {
      setKeyInput(apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    getAvailableMicrophones().then(setMicrophones).catch(console.error);
  }, []);

  useEffect(() => {
    Promise.all([getTextBackupDirectory(), getLastTextBackupDate()])
      .then(([dir, lastRun]) => {
        setBackupDir(dir);
        setLastBackupDate(lastRun);
      })
      .catch((err) => {
        console.error("Failed to load backup settings:", err);
        setBackupStatus("Could not load backup folder.");
      });
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

  const handleBackupNow = async () => {
    setBackupBusy(true);
    setBackupStatus(null);

    try {
      const result = await runTextBackupNow();
      setLastBackupDate(result.backupDate);
      setBackupDir(result.backupDir);
      setBackupStatus(
        `Backup saved. ${result.rowCount} rows exported${result.prunedCount > 0 ? `, ${result.prunedCount} old file${result.prunedCount === 1 ? "" : "s"} removed.` : "."}`,
      );
    } catch (err) {
      console.error("Failed to run text backup:", err);
      setBackupStatus(
        err instanceof Error ? err.message : "Backup failed.",
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const handleOpenBackupFolder = async () => {
    try {
      await openTextBackupDirectory();
    } catch (err) {
      console.error("Failed to open backup folder:", err);
      setBackupStatus(
        err instanceof Error ? err.message : "Could not open backup folder.",
      );
    }
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
            {audioSource === "system" &&
              "Records system/call audio. On macOS, grant screen recording permission and choose the screen or meeting app in the share picker, not the Meeting Tool window."}
            {audioSource === "both" &&
              "Records both microphone and system audio together. In the share picker, choose the screen or meeting app that has the call audio."}
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

      <div className="settings-section">
        <h3 className="settings-section-title">Text Backups</h3>
        <div className="settings-field">
          <span className="settings-label">Backup Folder</span>
          <input
            className="settings-input"
            value={backupDir}
            readOnly
          />
          <p className="settings-hint">
            The app writes one CSV per day to this folder, keeps the last 14
            days, and ignores recordings.
          </p>
        </div>

        <div className="settings-field">
          <span className="settings-label">Last Successful Backup</span>
          <p className="settings-static-text">
            {lastBackupDate ?? "No backup has run yet."}
          </p>
        </div>

        <div className="settings-actions">
          <button
            className="settings-save-btn"
            onClick={handleBackupNow}
            disabled={backupBusy}
          >
            {backupBusy ? "Backing Up..." : "Back Up Now"}
          </button>
          <button
            className="settings-secondary-btn"
            onClick={handleOpenBackupFolder}
            type="button"
          >
            Open in Finder
          </button>
        </div>

        {backupStatus && <p className="settings-hint">{backupStatus}</p>}
      </div>

      <button className="settings-save-btn" onClick={handleSave}>
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
