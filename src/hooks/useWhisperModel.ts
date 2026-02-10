import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ModelInfo {
  name: string;
  path: string;
  size_bytes: number;
  is_downloaded: boolean;
}

export function useWhisperModel() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const status = await invoke<ModelInfo>("get_model_status");
      setModelInfo(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const downloadModel = useCallback(
    async (modelName: string = "ggml-base.en") => {
      setDownloading(true);
      setError(null);

      const unlisten = await listen<string>(
        "model-download-progress",
        (event) => {
          setDownloadProgress(event.payload);
        },
      );

      try {
        await invoke("download_model", { modelName });
        await checkStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        unlisten();
        setDownloading(false);
      }
    },
    [checkStatus],
  );

  return {
    modelInfo,
    downloading,
    downloadProgress,
    error,
    downloadModel,
    checkStatus,
  };
}
