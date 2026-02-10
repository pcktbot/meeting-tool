import { SettingsForm } from "../components/Settings/SettingsModal";
import { useWhisperModel } from "../hooks/useWhisperModel";

export function SettingsPage() {
  const { modelInfo } = useWhisperModel();

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <section style={{ marginTop: "24px" }}>
        <h3>API Configuration</h3>
        <SettingsForm />
      </section>

      <section style={{ marginTop: "32px" }}>
        <h3>Whisper Model</h3>
        {modelInfo && (
          <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            <p>
              <strong>Model:</strong> {modelInfo.name}
            </p>
            <p>
              <strong>Status:</strong>{" "}
              {modelInfo.is_downloaded ? "Downloaded" : "Not downloaded"}
            </p>
            {modelInfo.size_bytes > 0 && (
              <p>
                <strong>Size:</strong>{" "}
                {(modelInfo.size_bytes / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
