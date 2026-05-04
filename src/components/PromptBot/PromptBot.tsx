import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../../hooks/useSettings";
import "./PromptBot.css";

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
}

function useEphemeralPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoading: false,
  });

  const play = useCallback((wavBytes: number[]) => {
    // Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setState({ isPlaying: false, currentTime: 0, duration: 0, isLoading: true });

    const blob = new Blob([new Uint8Array(wavBytes).buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setState((s) => ({ ...s, duration: audio.duration, isLoading: false }));
    });
    audio.addEventListener("canplay", () => {
      setState((s) => ({ ...s, isLoading: false }));
    });
    audio.addEventListener("timeupdate", () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }));
    });
    audio.addEventListener("ended", () => {
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
    });

    audio.play().then(() => {
      setState((s) => ({ ...s, isPlaying: true }));
    }).catch(console.error);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setState((s) => ({ ...s, isPlaying: true }))).catch(console.error);
    } else {
      audio.pause();
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  return { state, play, toggle };
}

interface PromptBotProps {
  readonly onClose: () => void;
}

export function PromptBot({ onClose }: PromptBotProps) {
  const { apiKey } = useSettings();
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "speaking" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { state: player, play, toggle } = useEphemeralPlayer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || status !== "idle") return;
    if (!apiKey) {
      setErrorMsg("API key required. Add it in Settings.");
      setStatus("error");
      return;
    }

    setStatus("thinking");
    setErrorMsg(null);

    try {
      const response = await invoke<string>("claude_complete", {
        apiKey,
        userContent: prompt.trim(),
        system: "You are a helpful assistant. Give concise, spoken-style responses (1-3 sentences unless more detail is clearly needed).",
        model: "claude-haiku-4-5-20251001",
      });

      setStatus("speaking");
      const voiceId = "david";
      const wavBytes = await invoke<number[]>("generate_tts", {
        text: response,
        voiceId,
      });
      play(wavBytes);
      setStatus("idle");
      setPrompt("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [prompt, status, apiKey, play]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const hasAudio = player.duration > 0 || player.isLoading;

  return (
    <div className="prompt-bot">
      <div className="prompt-bot-header">
        <span className="prompt-bot-title">Voice Bot</span>
        <button className="prompt-bot-close" onClick={onClose} type="button" title="Close">
          ✕
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="prompt-bot-input"
        placeholder="Ask me anything… (Enter to send)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={status === "thinking" || status === "speaking"}
        rows={3}
      />

      <div className="prompt-bot-footer">
        {hasAudio && status === "idle" && (
          <div className="prompt-bot-player">
            <button
              className="prompt-bot-player-toggle"
              onClick={toggle}
              disabled={player.isLoading}
              type="button"
            >
              {player.isLoading ? "…" : player.isPlaying ? "⏸" : "▶"}
            </button>
            <span className="prompt-bot-player-time">
              {fmt(player.currentTime)} / {fmt(player.duration)}
            </span>
          </div>
        )}

        {status === "thinking" && (
          <span className="prompt-bot-status">Thinking…</span>
        )}
        {status === "speaking" && (
          <span className="prompt-bot-status">Generating voice…</span>
        )}
        {status === "error" && errorMsg && (
          <span className="prompt-bot-error" title={errorMsg}>
            {errorMsg.includes("Voice service") ? "Voice service offline" : "Error"}
          </span>
        )}

        <button
          className="prompt-bot-send"
          onClick={handleSend}
          disabled={!prompt.trim() || status !== "idle"}
          type="button"
        >
          Send ▶
        </button>
      </div>
    </div>
  );
}
