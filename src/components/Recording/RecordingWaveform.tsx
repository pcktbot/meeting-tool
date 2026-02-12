import { useRef, useEffect } from "react";
import "./RecordingWaveform.css";

interface RecordingWaveformProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
}

export function RecordingWaveform({
  analyserNode,
  isRecording,
}: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isRecording || !analyserNode) return;

    const ctx = canvas.getContext("2d")!;
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const frequencyData = new Uint8Array(analyserNode.frequencyBinCount);

    let phase = 0;

    function draw() {
      try {
        analyserNode!.getByteFrequencyData(frequencyData);
      } catch {
        // AudioContext was closed, stop animating
        return;
      }

      // Derive band energies: low (0-15), mid (16-63), high (64-127)
      let low = 0;
      let mid = 0;
      let high = 0;
      for (let i = 0; i < 16; i++) low += frequencyData[i];
      for (let i = 16; i < 64; i++) mid += frequencyData[i];
      for (let i = 64; i < frequencyData.length; i++) high += frequencyData[i];
      low = low / 16 / 255;
      mid = mid / 48 / 255;
      high = high / Math.max(frequencyData.length - 64, 1) / 255;

      // Clear
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Draw waveform
      ctx.beginPath();
      ctx.strokeStyle = "#e53e3e";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#e53e3e";
      ctx.shadowBlur = 8;

      const centerY = HEIGHT / 2;
      const baseAmplitude = 3;
      phase += 0.04;

      for (let x = 0; x <= WIDTH; x++) {
        const t = x / WIDTH;
        const y =
          centerY +
          (baseAmplitude + low * 20) * Math.sin(t * Math.PI * 2 + phase) +
          mid * 10 * Math.sin(t * Math.PI * 4 + phase * 1.3) +
          high * 6 * Math.sin(t * Math.PI * 8 + phase * 2.1);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      className="recording-waveform"
      width={480}
      height={128}
    />
  );
}
