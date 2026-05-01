import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/Layout/AppLayout";
import { ContributionsPage } from "./pages/ContributionsPage";
import { ModelDownloader } from "./components/Model/ModelDownloader";
import { initializeSchema } from "./db/migrations";
import { invoke } from "@tauri-apps/api/core";
import {
  ensureDailyTextBackup,
  getBackupCheckIntervalMs,
} from "./services/backups";
import {
  getAudioRetentionCleanupIntervalMs,
  pruneExpiredAudioFiles,
} from "./services/audioRetention";
import { applyThemeSettings, getThemeSettings } from "./services/theme";

interface ModelInfo {
  name: string;
  path: string;
  size_bytes: number;
  is_downloaded: boolean;
}

const MeetingPage = lazy(() =>
  import("./pages/MeetingPage").then((module) => ({
    default: module.MeetingPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const HighlightsPage = lazy(() =>
  import("./pages/HighlightsPage").then((module) => ({
    default: module.HighlightsPage,
  })),
);
const SummariesPage = lazy(() =>
  import("./pages/SummariesPage").then((module) => ({
    default: module.SummariesPage,
  })),
);

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [showModelSetup, setShowModelSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        // Initialize database schema
        await initializeSchema();
        setDbReady(true);
        const theme = await getThemeSettings();
        applyThemeSettings(theme);
      } catch (err) {
        console.error("Database initialization failed:", err);
        setError(`Database init failed: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
        return;
      }

      // Check whisper model status
      try {
        const status = await invoke<ModelInfo>("get_model_status");
        if (status.is_downloaded) {
          await invoke("load_model");
          setModelReady(true);
        } else {
          setShowModelSetup(true);
        }
      } catch {
        setShowModelSetup(true);
      }

      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    const handler = async () => {
      try {
        const theme = await getThemeSettings();
        applyThemeSettings(theme);
      } catch (err) {
        console.error("Failed to refresh theme settings:", err);
      }
    };

    void handler();
    globalThis.addEventListener("theme-settings-updated", handler);
    return () => globalThis.removeEventListener("theme-settings-updated", handler);
  }, []);

  useEffect(() => {
    if (!dbReady) return;

    let cancelled = false;
    const runBackup = async () => {
      try {
        if (!cancelled) {
          await ensureDailyTextBackup();
        }
      } catch (err) {
        console.error("Automatic text backup failed:", err);
      }
    };

    void runBackup();
    const intervalId = globalThis.setInterval(
      runBackup,
      getBackupCheckIntervalMs(),
    );

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [dbReady]);

  useEffect(() => {
    if (!dbReady) return;

    let cancelled = false;
    const runAudioCleanup = async () => {
      try {
        if (!cancelled) {
          await pruneExpiredAudioFiles();
        }
      } catch (err) {
        console.error("Automatic audio cleanup failed:", err);
      }
    };

    void runAudioCleanup();
    const intervalId = globalThis.setInterval(
      runAudioCleanup,
      getAudioRetentionCleanupIntervalMs(),
    );

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [dbReady]);

  if (error) {
    return (
      <div className="app-loading">
        <p style={{ color: "#e53e3e" }}>{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app-loading">
        <p>Initializing Daily Work Diary...</p>
      </div>
    );
  }

  if (showModelSetup && !modelReady) {
    return (
      <ModelDownloader
        onComplete={() => {
          setModelReady(true);
          setShowModelSetup(false);
        }}
      />
    );
  }

  if (!dbReady) {
    return (
      <div className="app-loading">
        <p>Setting up database...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppLayout>
        <Suspense fallback={<div className="app-loading"><p>Loading page...</p></div>}>
          <Routes>
            <Route path="/" element={<ContributionsPage />} />
            <Route path="/contributions" element={<ContributionsPage />} />
            <Route path="/meeting/:id" element={<MeetingPage />} />
            <Route path="/highlights" element={<HighlightsPage />} />
            <Route path="/summaries" element={<SummariesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
