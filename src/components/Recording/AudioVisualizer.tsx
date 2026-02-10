import "./AudioVisualizer.css";

interface AudioVisualizerProps {
  level: number; // 0-1
}

export function AudioVisualizer({ level }: AudioVisualizerProps) {
  const bars = 5;
  return (
    <div className="audio-visualizer">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = (i + 1) / bars;
        const active = level >= threshold * 0.8;
        return (
          <div
            key={i}
            className={`audio-bar ${active ? "audio-bar--active" : ""}`}
            style={{ height: `${8 + i * 4}px` }}
          />
        );
      })}
    </div>
  );
}
