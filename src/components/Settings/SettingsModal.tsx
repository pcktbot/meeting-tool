import { useState, useEffect } from "react";
import { useSettings } from "../../hooks/useSettings";
import "./SettingsModal.css";

export function SettingsForm() {
  const { apiKey, setApiKey, loading } = useSettings();
  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (apiKey) {
      setKeyInput(apiKey);
    }
  }, [apiKey]);

  const handleSave = async () => {
    await setApiKey(keyInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <p>Loading settings...</p>;

  return (
    <div className="settings-form">
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

      <button className="settings-save-btn" onClick={handleSave}>
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
