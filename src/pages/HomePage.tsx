import { RecordButton } from "../components/Recording/RecordButton";
import { ImportButton } from "../components/Recording/ImportButton";
import "./HomePage.css";

export function HomePage() {
  return (
    <div className="home-page">
      <div className="home-hero">
        <h2>Meeting Transcriber</h2>
        <p className="home-subtitle">
          Record or import audio, transcribe locally, and summarize with AI.
        </p>
        <div className="home-actions">
          <RecordButton />
          <ImportButton />
        </div>
      </div>
    </div>
  );
}
