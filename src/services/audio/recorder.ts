import type { AudioSourceConfig, RecordingStartResult } from "./types";

class MissingSystemAudioError extends Error {
  displaySurface?: string;

  constructor(message: string, displaySurface?: string) {
    super(message);
    this.name = "MissingSystemAudioError";
    this.displaySurface = displaySurface;
  }
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private streams: MediaStream[] = [];
  private startTime: number = 0;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private mixAudioContext: AudioContext | null = null;
  private config: AudioSourceConfig = { source: "microphone" };
  private readonly isMac = navigator.userAgent.includes("Mac");

  async start(config?: AudioSourceConfig): Promise<RecordingStartResult> {
    this.config = config ?? { source: "microphone" };
    console.log("[AudioRecorder] Starting with config:", this.config);

    try {
      const { recordingStream, cleanupStreams, startResult } = await this.getAudioStream(
        this.config,
      );
      this.streams = cleanupStreams;

      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(recordingStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      this.mediaRecorder = new MediaRecorder(recordingStream, {
        mimeType: "audio/webm;codecs=opus",
      });

      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log("[AudioRecorder] Chunk received:", event.data.size, "bytes");
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error("[AudioRecorder] MediaRecorder error:", event);
      };

      this.mediaRecorder.onstart = () => {
        console.log("[AudioRecorder] Recording started");
      };

      this.mediaRecorder.onstop = () => {
        console.log("[AudioRecorder] Recording stopped");
      };

      this.mediaRecorder.start(1000);
      this.startTime = Date.now();
      console.log("[AudioRecorder] MediaRecorder started successfully");
      return startResult;
    } catch (err) {
      console.error("[AudioRecorder] Failed to start:", err);
      this.cleanup();
      throw err;
    }
  }

  private async getAudioStream(config: AudioSourceConfig): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
    startResult: RecordingStartResult;
  }> {
    if (this.isMac && config.source !== "microphone") {
      const micCapture = await this.getMicrophoneStream(config.microphoneDeviceId);
      return {
        ...micCapture,
        startResult: {
          requestedSource: config.source,
          actualSource: "microphone",
          fallbackReason:
            "System audio is not currently available in the macOS app runtime, so recording continued with microphone only.",
        },
      };
    }

    switch (config.source) {
      case "microphone":
        return this.getMicrophoneStream(config.microphoneDeviceId);
      case "system":
        return this.getSystemAudioWithMicrophoneFallback(config);
      case "both":
        return this.getCombinedStreamWithFallback(config.microphoneDeviceId);
      default:
        return this.getMicrophoneStream();
    }
  }

  private async getMicrophoneStream(deviceId?: string): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
    startResult: RecordingStartResult;
  }> {
    console.log("[AudioRecorder] Requesting microphone access...");
    const constraints: MediaStreamConstraints = {
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        ...(deviceId && { deviceId: { exact: deviceId } }),
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log(
      "[AudioRecorder] Microphone access granted, tracks:",
      stream.getAudioTracks().length,
    );
    return {
      recordingStream: stream,
      cleanupStreams: [stream],
      startResult: {
        requestedSource: this.config.source,
        actualSource: "microphone",
      },
    };
  }

  private async getSystemAudioStream(): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
  }> {
    console.log("[AudioRecorder] Requesting system audio (screen capture)...");

    const displayMediaOptions: DisplayMediaStreamOptions = {
      // Keep the initial request permissive. Some runtimes omit the audio track
      // entirely when stricter display/audio constraints are supplied up front.
      video: true,
      audio: true,
    };
    const nonStandardOptions = displayMediaOptions as DisplayMediaStreamOptions &
      Record<string, unknown>;
    nonStandardOptions.preferCurrentTab = false;
    nonStandardOptions.selfBrowserSurface = "exclude";
    nonStandardOptions.surfaceSwitching = "exclude";
    nonStandardOptions.systemAudio = "include";
    nonStandardOptions.windowAudio = "system";
    nonStandardOptions.monitorTypeSurfaces = "include";

    const stream =
      await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

    const audioTracks = stream.getAudioTracks();
    const displaySurface = stream
      .getVideoTracks()
      .at(0)
      ?.getSettings().displaySurface;

    console.log(
      "[AudioRecorder] Display capture selected:",
      displaySurface ?? "unknown",
    );

    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw this.createMissingSystemAudioError(displaySurface);
    }

    console.log(
      "[AudioRecorder] System audio access granted, tracks:",
      audioTracks.length,
    );

    return {
      recordingStream: new MediaStream(audioTracks),
      cleanupStreams: [stream],
    };
  }

  private async getSystemAudioWithMicrophoneFallback(
    config: AudioSourceConfig,
  ): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
    startResult: RecordingStartResult;
  }> {
    try {
      const systemCapture = await this.getSystemAudioStream();
      return {
        ...systemCapture,
        startResult: {
          requestedSource: config.source,
          actualSource: "system",
        },
      };
    } catch (err) {
      if (this.shouldFallbackToMicrophone(err)) {
        console.warn(
          "[AudioRecorder] System audio unavailable, falling back to microphone",
        );
        const micCapture = await this.getMicrophoneStream(config.microphoneDeviceId);
        return {
          ...micCapture,
          startResult: {
            requestedSource: config.source,
            actualSource: "microphone",
            fallbackReason:
              "System audio is not available in the macOS webview runtime for this app, so recording continued with microphone only.",
          },
        };
      }

      throw err;
    }
  }

  private async getCombinedStreamWithFallback(micDeviceId?: string): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
    startResult: RecordingStartResult;
  }> {
    console.log("[AudioRecorder] Setting up combined mic + system audio...");

    const micCapture = await this.getMicrophoneStream(micDeviceId);
    let systemCapture: Awaited<ReturnType<typeof this.getSystemAudioStream>> | null =
      null;

    try {
      systemCapture = await this.getSystemAudioStream();
    } catch (err) {
      if (!this.shouldFallbackToMicrophone(err)) {
        throw err;
      }

      console.warn(
        "[AudioRecorder] System audio unavailable, continuing with microphone only",
      );
      return {
        recordingStream: micCapture.recordingStream,
        cleanupStreams: micCapture.cleanupStreams,
        startResult: {
          requestedSource: "both",
          actualSource: "microphone",
          fallbackReason:
            "System audio is not available in the macOS webview runtime for this app, so recording continued with microphone only.",
        },
      };
    }

    this.mixAudioContext = new AudioContext();
    const destination = this.mixAudioContext.createMediaStreamDestination();

    const micSource = this.mixAudioContext.createMediaStreamSource(
      micCapture.recordingStream,
    );

    // Create gain nodes to balance volumes
    const micGain = this.mixAudioContext.createGain();
    const systemGain = this.mixAudioContext.createGain();
    micGain.gain.value = 1;
    systemGain.gain.value = 1;

    micSource.connect(micGain);
    const systemSource = this.mixAudioContext.createMediaStreamSource(
      systemCapture.recordingStream,
    );
    systemSource.connect(systemGain);
    micGain.connect(destination);
    systemGain.connect(destination);

    console.log("[AudioRecorder] Combined stream created");
    return {
      recordingStream: destination.stream,
      cleanupStreams: [
        ...micCapture.cleanupStreams,
        ...systemCapture.cleanupStreams,
        destination.stream,
      ],
      startResult: {
        requestedSource: "both",
        actualSource: "both",
      },
    };
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        console.error("[AudioRecorder] stop() called but not recording");
        reject(new Error("Not recording"));
        return;
      }

      if (this.mediaRecorder.state === "inactive") {
        console.error("[AudioRecorder] MediaRecorder already inactive");
        reject(new Error("MediaRecorder is inactive"));
        return;
      }

      console.log("[AudioRecorder] Stopping, current state:", this.mediaRecorder.state);
      console.log("[AudioRecorder] Chunks collected:", this.audioChunks.length);

      this.mediaRecorder.onstop = () => {
        console.log("[AudioRecorder] onstop fired, total chunks:", this.audioChunks.length);
        const totalSize = this.audioChunks.reduce((acc, chunk) => acc + chunk.size, 0);
        console.log("[AudioRecorder] Total size:", totalSize, "bytes");
        
        const blob = new Blob(this.audioChunks, { type: "audio/webm" });
        this.cleanup();
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  getAudioLevel(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const average = data.reduce((a, b) => a + b, 0) / data.length;
    return average / 255;
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyser;
  }

  getDuration(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  isActive(): boolean {
    return this.mediaRecorder?.state === "recording";
  }

  private cleanup(): void {
    console.log("[AudioRecorder] Cleaning up...");
    this.streams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        console.log("[AudioRecorder] Stopping track:", track.kind, track.label);
        track.stop();
      });
    });
    this.audioContext?.close();
    this.mixAudioContext?.close();
    this.streams = [];
    this.audioContext = null;
    this.mixAudioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
  }

  private shouldFallbackToMicrophone(err: unknown): err is MissingSystemAudioError {
    return err instanceof MissingSystemAudioError;
  }

  private createMissingSystemAudioError(displaySurface?: string): MissingSystemAudioError {
    const isMac = navigator.userAgent.includes("Mac");
    const sharedTarget = displaySurface ? ` Shared target: ${displaySurface}.` : "";
    const message = isMac
      ? `System audio was not captured.${sharedTarget} This app is currently using webview-based screen capture, and on macOS that runtime may return a screen stream without any system-audio track. Microphone recording still works, but system audio needs a native macOS capture path to be reliable.`
      : `No system audio track was captured.${sharedTarget} Re-open recording and make sure audio sharing is enabled in the picker.`;

    return new MissingSystemAudioError(message, displaySurface);
  }
}

export async function getAvailableMicrophones(): Promise<MediaDeviceInfo[]> {
  // Request permission first to get device labels
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    console.warn("Could not get mic permission for device enumeration");
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}
