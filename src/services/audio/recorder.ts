import type { AudioSourceConfig } from "./types";

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private streams: MediaStream[] = [];
  private startTime: number = 0;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private config: AudioSourceConfig = { source: "microphone" };

  async start(config?: AudioSourceConfig): Promise<void> {
    this.config = config ?? { source: "microphone" };
    console.log("[AudioRecorder] Starting with config:", this.config);

    try {
      const stream = await this.getAudioStream(config);
      this.streams = [stream];

      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      this.mediaRecorder = new MediaRecorder(stream, {
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

  private async getAudioStream(config: AudioSourceConfig): Promise<MediaStream> {
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

  private async getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
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
    console.log("[AudioRecorder] Microphone access granted, tracks:", stream.getAudioTracks().length);
    return stream;
  }

  private async getSystemAudioStream(): Promise<MediaStream> {
    console.log("[AudioRecorder] Requesting system audio (screen capture)...");
    
    // getDisplayMedia requires video, but we only care about audio
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Required but we won't use it
      audio: {
        channelCount: 2,
        sampleRate: 48000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } as MediaTrackConstraints,
    });

    // Stop video track immediately - we only want audio
    stream.getVideoTracks().forEach((track) => {
      console.log("[AudioRecorder] Stopping video track (not needed)");
      track.stop();
    });

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("No system audio track available. Make sure to check 'Share audio' in the picker.");
    }

    console.log("[AudioRecorder] System audio access granted, tracks:", audioTracks.length);
    
    // Create a new stream with only audio
    return new MediaStream(audioTracks);
  }

  private async getCombinedStream(micDeviceId?: string): Promise<MediaStream> {
    console.log("[AudioRecorder] Setting up combined mic + system audio...");
    
    const [micStream, systemStream] = await Promise.all([
      this.getMicrophoneStream(micDeviceId),
      this.getSystemAudioStream(),
    ]);

    this.streams = [micStream, systemStream];

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    const micSource = audioContext.createMediaStreamSource(micStream);

    // Create gain nodes to balance volumes
    const micGain = audioContext.createGain();
    const systemGain = audioContext.createGain();
    micGain.gain.value = 1;
    systemGain.gain.value = 1;

    micSource.connect(micGain);
    const systemSource = audioContext.createMediaStreamSource(systemStream);
    systemSource.connect(systemGain);
    micGain.connect(destination);
    systemGain.connect(destination);

    console.log("[AudioRecorder] Combined stream created");
    return destination.stream;
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
    this.streams = [];
    this.audioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
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
