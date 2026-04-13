import type { AudioSourceConfig } from "./types";

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private streams: MediaStream[] = [];
  private startTime: number = 0;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private mixAudioContext: AudioContext | null = null;
  private config: AudioSourceConfig = { source: "microphone" };

  async start(config?: AudioSourceConfig): Promise<void> {
    this.config = config ?? { source: "microphone" };
    console.log("[AudioRecorder] Starting with config:", this.config);

    try {
      const { recordingStream, cleanupStreams } = await this.getAudioStream(
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
    } catch (err) {
      console.error("[AudioRecorder] Failed to start:", err);
      this.cleanup();
      throw err;
    }
  }

  private async getAudioStream(config: AudioSourceConfig): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
  }> {
    switch (config.source) {
      case "microphone":
        return this.getMicrophoneStream(config.microphoneDeviceId);
      case "system":
        return this.getSystemAudioStream();
      case "both":
        return this.getCombinedStream(config.microphoneDeviceId);
      default:
        return this.getMicrophoneStream();
    }
  }

  private async getMicrophoneStream(deviceId?: string): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
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
    };
  }

  private async getSystemAudioStream(): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
  }> {
    console.log("[AudioRecorder] Requesting system audio (screen capture)...");

    const displayMediaOptions: DisplayMediaStreamOptions = {
      // Keep display capture active while recording. Some webviews tie the
      // audio track lifetime to the original display capture session.
      video: {
        displaySurface: "monitor",
        frameRate: { ideal: 5, max: 15 },
      } as MediaTrackConstraints,
      audio: {
        channelCount: 2,
        sampleRate: 48000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      } as MediaTrackConstraints,
    };
    const nonStandardOptions = displayMediaOptions as DisplayMediaStreamOptions &
      Record<string, unknown>;
    nonStandardOptions.preferCurrentTab = false;
    nonStandardOptions.selfBrowserSurface = "exclude";
    nonStandardOptions.surfaceSwitching = "exclude";
    nonStandardOptions.systemAudio = "include";
    nonStandardOptions.monitorTypeSurfaces = "include";

    const stream =
      await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw this.createMissingSystemAudioError();
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

  private async getCombinedStream(micDeviceId?: string): Promise<{
    recordingStream: MediaStream;
    cleanupStreams: MediaStream[];
  }> {
    console.log("[AudioRecorder] Setting up combined mic + system audio...");

    const [micCapture, systemCapture] = await Promise.all([
      this.getMicrophoneStream(micDeviceId),
      this.getSystemAudioStream(),
    ]);

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

  private createMissingSystemAudioError(): Error {
    const isMac = navigator.userAgent.includes("Mac");
    const message = isMac
      ? "System audio was not captured. In the share picker, choose the screen or meeting app that has the call audio, and do not share the Meeting Tool window."
      : "No system audio track was captured. Re-open recording and make sure audio sharing is enabled in the picker.";

    return new Error(message);
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
