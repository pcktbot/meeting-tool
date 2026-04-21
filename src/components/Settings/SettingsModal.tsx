import { useEffect, useRef, useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import type { ThemeSettings } from "../../services/theme";
import { getAvailableMicrophones } from "../../services/audio/recorder";
import {
  getLastTextBackupDate,
  getTextBackupDirectory,
  openTextBackupDirectory,
  runTextBackupNow,
} from "../../services/backups";
import "./SettingsModal.css";

const THEME_FIELDS = [
  { key: "bgPrimary", label: "App Background" },
  { key: "bgSecondary", label: "Surface Background" },
  { key: "bgSidebar", label: "Header Background" },
  { key: "textPrimary", label: "Primary Text" },
  { key: "textSecondary", label: "Muted Text" },
  { key: "border", label: "Borders" },
  { key: "hover", label: "Hover State" },
  { key: "active", label: "Active State" },
  { key: "accent", label: "Accent" },
] as const;

export function SettingsForm() {
  const {
    apiKey,
    setApiKey,
    cleanupStylePrompt,
    setCleanupStylePrompt,
    microphoneDeviceId,
    setMicrophoneDeviceId,
    audioRetentionDays,
    setAudioRetentionDays,
    themeSettings,
    setThemeColor,
    loading,
  } = useSettings();
  const [keyInput, setKeyInput] = useState("");
  const [cleanupPromptInput, setCleanupPromptInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [backupDir, setBackupDir] = useState("");
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [themeDrafts, setThemeDrafts] = useState<Partial<Record<keyof ThemeSettings, string>>>({});
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (apiKey) {
      setKeyInput(apiKey);
    }
  }, [apiKey]);

  useEffect(() => {
    setCleanupPromptInput(cleanupStylePrompt);
  }, [cleanupStylePrompt]);

  useEffect(() => {
    if (!themeSettings) return;
    setThemeDrafts({ ...themeSettings });
  }, [themeSettings]);

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
    await Promise.all([
      setApiKey(keyInput),
      setCleanupStylePrompt(cleanupPromptInput),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleMicrophoneChange = async (deviceId: string) => {
    await setMicrophoneDeviceId(deviceId);
  };

  const handleAudioRetentionChange = async (value: string) => {
    await setAudioRetentionDays(value);
  };

  const handleThemeDraftChange = (
    key: keyof ThemeSettings,
    value: string,
  ) => {
    setThemeDrafts((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const commitThemeDraft = async (key: keyof ThemeSettings) => {
    const draftValue = themeDrafts[key] ?? themeSettings?.[key] ?? "";
    const normalized = await setThemeColor(key, draftValue);
    setThemeDrafts((current) => ({
      ...current,
      [key]: normalized,
    }));
  };

  const handleThemeKeyDown = async (
    event: React.KeyboardEvent<HTMLInputElement>,
    key: keyof ThemeSettings,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await commitThemeDraft(key);
      event.currentTarget.blur();
    }
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
          <span className="settings-label">Audio Source</span>
          <p className="settings-static-text">Microphone only</p>
          <p className="settings-hint">
            The app currently records from your selected microphone. System and
            mixed-device capture are not exposed in the product settings right now.
          </p>
        </div>

        {microphones.length > 0 && (
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

        <div className="settings-field">
          <label className="settings-label" htmlFor="audio-retention">
            Audio Retention
          </label>
          <select
            id="audio-retention"
            className="settings-select"
            value={audioRetentionDays}
            onChange={(e) => handleAudioRetentionChange(e.target.value)}
          >
            <option value="14">14 days</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="never">Keep until deleted</option>
          </select>
          <p className="settings-hint">
            Audio recordings and imported voice notes stay playable for this
            long, then the app removes the file but keeps the transcript text.
          </p>
        </div>
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
            Required for meeting summarization and optional transcript cleanup.
            Get your key from
            console.anthropic.com
          </p>
        </div>
        <div className="settings-field">
          <label className="settings-label" htmlFor="cleanup-style-prompt">
            Claude Cleanup Style Preferences
          </label>
          <textarea
            id="cleanup-style-prompt"
            className="settings-input settings-textarea"
            value={cleanupPromptInput}
            onChange={(e) => setCleanupPromptInput(e.target.value)}
            placeholder="Example: Keep a concise professional tone, preserve first-person voice, and prefer short paragraphs."
            rows={4}
          />
          <p className="settings-hint">
            These instructions are injected into the optional Claude transcript
            cleanup action so you can apply preferred tone and formatting.
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Theme</h3>
        <div className="settings-theme-grid">
          {themeSettings &&
            THEME_FIELDS.map((field) => (
              <div key={field.key} className="settings-theme-field">
                <label className="settings-label" htmlFor={`theme-${field.key}`}>
                  {field.label}
                </label>
                <div className="settings-color-row">
                  <input
                    id={`theme-${field.key}`}
                    ref={(node) => {
                      colorInputRefs.current[field.key] = node;
                    }}
                    type="color"
                    className="settings-color-picker-input"
                    value={themeSettings[field.key]}
                    onChange={(e) => {
                      handleThemeDraftChange(field.key, e.target.value);
                      void setThemeColor(field.key, e.target.value).then((normalized) => {
                        setThemeDrafts((current) => ({
                          ...current,
                          [field.key]: normalized,
                        }));
                      });
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    className="settings-color-swatch"
                    onClick={() => colorInputRefs.current[field.key]?.click()}
                    aria-label={`Pick ${field.label.toLowerCase()} color`}
                    title={`Pick ${field.label.toLowerCase()} color`}
                    style={{ backgroundColor: themeSettings[field.key] }}
                  />
                  <input
                    aria-label={`${field.label} hex value`}
                    type="text"
                    className="settings-input settings-color-value"
                    value={themeDrafts[field.key] ?? themeSettings[field.key]}
                    onChange={(e) => handleThemeDraftChange(field.key, e.target.value)}
                    onBlur={() => void commitThemeDraft(field.key)}
                    onKeyDown={(e) => void handleThemeKeyDown(e, field.key)}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>
            ))}
        </div>
        <p className="settings-hint">
          Theme colors are stored as hex values and applied live to the app UI.
        </p>
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
