import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { importAudioFile } from "../../services/audio/fileManager";
import { convertToWav } from "../../services/audio/converter";
import { saveAudioFile } from "../../services/audio/fileManager";
import { createMeeting, saveAudioRecord } from "../../services/meetings";
import { loadAudioFile } from "../../services/audio/fileManager";

export function ImportButton() {
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importAudioFile();
      if (!result) {
        setImporting(false);
        return;
      }

      let wavPath = result.path;
      let fileSize = 0;

      // If not WAV, convert for whisper compatibility
      if (result.format !== "wav") {
        const rawData = await loadAudioFile(result.path);
        const blob = new Blob([rawData.buffer as ArrayBuffer]);
        const wavBuffer = await convertToWav(blob);
        const wavFilename = `converted-${Date.now()}.wav`;
        wavPath = await saveAudioFile(wavBuffer, wavFilename);
        fileSize = wavBuffer.byteLength;
      } else {
        const rawData = await loadAudioFile(result.path);
        fileSize = rawData.byteLength;
      }

      const meeting = await createMeeting();
      await saveAudioRecord(meeting.id, wavPath, "wav", null, fileSize);

      navigate(`/meeting/${meeting.id}`);
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <button
      className="import-btn"
      onClick={handleImport}
      disabled={importing}
    >
      {importing ? "Importing..." : "Import Audio"}
    </button>
  );
}
