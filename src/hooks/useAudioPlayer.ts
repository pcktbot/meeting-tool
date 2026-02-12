import { useState, useRef, useEffect, useCallback } from "react";
import { loadAudioFile } from "../services/audio/fileManager";

export function useAudioPlayer(
  filePath: string | undefined,
  storedDuration: number | null,
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(storedDuration ?? 0);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Load audio file and create blob URL
  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const data = await loadAudioFile(filePath);
        if (cancelled) return;

        const blob = new Blob([data.buffer as ArrayBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.addEventListener("loadedmetadata", () => {
          if (!cancelled) {
            setDuration(audio.duration);
            setIsLoading(false);
          }
        });

        audio.addEventListener("timeupdate", () => {
          if (!cancelled) {
            setCurrentTime(audio.currentTime);
          }
        });

        audio.addEventListener("ended", () => {
          if (!cancelled) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        });

        audio.addEventListener("error", () => {
          if (!cancelled) {
            console.error("Audio playback error");
            setIsLoading(false);
          }
        });

        // If loadedmetadata doesn't fire (e.g. already cached), use stored duration
        audio.addEventListener("canplay", () => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
      } catch (err) {
        console.error("Failed to load audio file:", err);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
    };
  }, [filePath]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const clampedFraction = Math.max(0, Math.min(1, fraction));
      audio.currentTime = clampedFraction * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  return {
    isPlaying,
    currentTime,
    duration,
    isLoading,
    toggle,
    seek,
  };
}
