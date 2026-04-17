import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/Layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { MeetingPage } from "./pages/MeetingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HighlightsPage } from "./pages/HighlightsPage";
import { ContributionsPage } from "./pages/ContributionsPage";
import { SummariesPage } from "./pages/SummariesPage";
import { ModelDownloader } from "./components/Model/ModelDownloader";
import { initializeSchema } from "./db/migrations";
import { invoke } from "@tauri-apps/api/core";
import {
  ensureDailyTextBackup,
  getBackupCheckIntervalMs,
} from "./services/backups";

interface ModelInfo {
  name: string;
  path: string;
  size_bytes: number;
  is_downloaded: boolean;
}

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
        <p>Initializing Meeting Transcriber...</p>
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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/meeting/:id" element={<MeetingPage />} />
          <Route path="/highlights" element={<HighlightsPage />} />
          <Route path="/contributions" element={<ContributionsPage />} />
          <Route path="/summaries" element={<SummariesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
