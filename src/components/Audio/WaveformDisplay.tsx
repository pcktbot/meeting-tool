import { useRef, useEffect, useCallback } from "react";
import "./WaveformDisplay.css";

interface WaveformDisplayProps {
  peaks: number[];
  progress?: number; // 0-1
  onSeek?: (fraction: number) => void;
}

export function WaveformDisplay({
  peaks,
  progress,
  onSeek,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const barWidth = 2;
    const gap = 1;
    const pitch = barWidth + gap;
    const numBars = Math.min(peaks.length, Math.floor(displayWidth / pitch));
    const centerY = displayHeight / 2;
    const maxBarHeight = centerY - 2;

    // Get colors from CSS custom properties
    const computedStyle = getComputedStyle(canvas);
    const accentColor =
      computedStyle.getPropertyValue("--accent").trim() || "#1F5673";
    const bgSecondary =
      computedStyle.getPropertyValue("--bg-secondary").trim() || "#f7f7f8";

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw center line
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(displayWidth, centerY);
    ctx.stroke();

    // Draw mirrored bars
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = accentColor;

    for (let i = 0; i < numBars; i++) {
      const peakIndex = Math.floor((i / numBars) * peaks.length);
      const amplitude = peaks[peakIndex];
      const barHeight = Math.max(1, amplitude * maxBarHeight);

      const x = i * pitch;

      // Top half
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
      // Bottom half (mirror)
      ctx.fillRect(x, centerY, barWidth, barHeight);
    }

    ctx.globalAlpha = 1;

    // Draw progress overlay (dim unplayed portion)
    if (progress != null && progress > 0) {
      const progressX = progress * displayWidth;
      ctx.fillStyle = bgSecondary;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(progressX, 0, displayWidth - progressX, displayHeight);
      ctx.globalAlpha = 1;
    }
  }, [peaks, progress]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      onSeek(fraction);
    },
    [onSeek],
  );

  return (
    <canvas
      ref={canvasRef}
      className={`waveform-display${onSeek ? " waveform-display--interactive" : ""}`}
      onClick={handleClick}
    />
  );
}
