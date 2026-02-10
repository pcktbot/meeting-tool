import { useWhisperModel } from "../../hooks/useWhisperModel";
import "./ModelDownloader.css";

interface ModelDownloaderProps {
  onComplete: () => void;
}

export function ModelDownloader({ onComplete }: ModelDownloaderProps) {
  const { downloading, downloadProgress, error, downloadModel } =
    useWhisperModel();

  const handleDownload = async () => {
    await downloadModel("ggml-base.en");
    onComplete();
  };

  return (
    <div className="model-downloader">
      <div className="model-downloader-card">
        <h2>Welcome to Meeting Transcriber</h2>
        <p className="model-downloader-desc">
          To transcribe audio locally, a speech recognition model needs to be
          downloaded. This is a one-time setup (~148 MB).
        </p>

        <div className="model-info">
          <strong>Model:</strong> Whisper Base (English)
          <br />
          <strong>Size:</strong> ~148 MB
          <br />
          <strong>Source:</strong> HuggingFace (whisper.cpp)
        </div>

        {downloading ? (
          <div className="model-progress">
            <div className="progress-spinner-lg" />
            <span>{downloadProgress || "Downloading..."}</span>
          </div>
        ) : (
          <button className="model-download-btn" onClick={handleDownload}>
            Download Model
          </button>
        )}

        {error && <p className="model-error">{error}</p>}
      </div>
    </div>
  );
}
