import { initialRecorderSnapshot, type RecordedAudio, type RecorderSnapshot } from "../features/recording/types";
import { transitionRecorderStatus, type RecorderEvent } from "../features/recording/recorderMachine";
import { AudioRecorderError, mapAudioRecorderError } from "./audioErrors";
import { createAudioMeter, type AudioMeter, type AudioMeterFactory } from "./audioMeter";

type MediaRecorderLike = {
  readonly mimeType: string;
  readonly state: RecordingState;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onstop: ((event: Event) => void) | null;
  start: (timeslice?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type MediaRecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorderLike;
  isTypeSupported?: (mimeType: string) => boolean;
};

export type AudioRecorderDependencies = {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  MediaRecorder?: MediaRecorderConstructor;
  meterFactory: AudioMeterFactory;
  now: () => number;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

export type BrowserAudioRecorderOptions = {
  minDurationMs?: number;
  silenceThreshold?: number;
  dataTimesliceMs?: number;
  dependencies?: Partial<AudioRecorderDependencies>;
};

const supportedMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function defaultDependencies(): AudioRecorderDependencies {
  return {
    mediaDevices: typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
    MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : (MediaRecorder as unknown as MediaRecorderConstructor),
    meterFactory: createAudioMeter,
    now: () => performance.now(),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

function chooseMimeType(MediaRecorderCtor: MediaRecorderConstructor): string | undefined {
  if (!MediaRecorderCtor.isTypeSupported) return undefined;
  return supportedMimeTypes.find((mimeType) => MediaRecorderCtor.isTypeSupported?.(mimeType));
}

export class BrowserAudioRecorder {
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshot;

  private readonly dependencies: AudioRecorderDependencies;
  private readonly minDurationMs: number;
  private readonly silenceThreshold: number;
  private readonly dataTimesliceMs: number;
  private readonly listeners = new Set<() => void>();
  private snapshot: RecorderSnapshot = initialRecorderSnapshot;
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorderLike | null = null;
  private meter: AudioMeter | null = null;
  private meterSupported = false;
  private chunks: Blob[] = [];
  private activeStartedAt: number | null = null;
  private activeDurationMs = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private previewUrl: string | null = null;
  private trackEndedListeners = new Map<MediaStreamTrack, () => void>();
  private suppressTrackEnded = false;
  private permissionGeneration = 0;
  private captureGeneration = 0;
  private pendingStop: { resolve: (result: RecordedAudio) => void; reject: (error: AudioRecorderError) => void } | null = null;

  constructor(options: BrowserAudioRecorderOptions = {}) {
    this.dependencies = { ...defaultDependencies(), ...options.dependencies };
    this.minDurationMs = Math.max(0, options.minDurationMs ?? 1_500);
    this.silenceThreshold = Math.max(0, options.silenceThreshold ?? 0.015);
    this.dataTimesliceMs = Math.max(100, options.dataTimesliceMs ?? 250);
  }

  async requestPermission(): Promise<void> {
    if (this.snapshot.status === "ready" && this.stream) return;
    if (this.snapshot.status === "recording" || this.snapshot.status === "paused" || this.snapshot.status === "stopping") {
      throw new AudioRecorderError("invalid-state");
    }
    await this.resetResources();
    this.discardPreview();
    if (this.snapshot.status !== "idle") this.applyTransition("reset");
    this.applyTransition("request-permission", { error: null, result: null, durationMs: 0, inputLevel: 0, peakLevel: 0 });

    const mediaDevices = this.dependencies.mediaDevices;
    const MediaRecorderCtor = this.dependencies.MediaRecorder;
    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      await this.fail(new AudioRecorderError("unsupported"));
      throw new AudioRecorderError("unsupported");
    }

    const requestGeneration = ++this.permissionGeneration;
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (requestGeneration !== this.permissionGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        throw new AudioRecorderError("cancelled");
      }
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new AudioRecorderError("no-device");
      }
      this.stream = stream;
      this.attachTrackEndedListeners(stream);
      await this.startMeter(stream);
      if (requestGeneration !== this.permissionGeneration) {
        await this.resetResources();
        throw new AudioRecorderError("cancelled");
      }
      this.applyTransition("permission-granted", { hasLiveStream: true, inputLevel: 0 });
    } catch (error) {
      const mapped = mapAudioRecorderError(error);
      if (mapped.code === "cancelled") throw mapped;
      await this.fail(mapped);
      throw mapped;
    }
  }

  async start(): Promise<void> {
    if (this.snapshot.status !== "ready" || !this.stream) await this.requestPermission();
    if (!this.stream || this.snapshot.status !== "ready") throw new AudioRecorderError("invalid-state");
    const MediaRecorderCtor = this.dependencies.MediaRecorder;
    if (!MediaRecorderCtor) throw new AudioRecorderError("unsupported");

    this.discardPreview();
    this.chunks = [];
    this.activeDurationMs = 0;
    this.activeStartedAt = this.dependencies.now();
    const mimeType = chooseMimeType(MediaRecorderCtor);
    try {
      this.mediaRecorder = mimeType ? new MediaRecorderCtor(this.stream, { mimeType }) : new MediaRecorderCtor(this.stream);
      const captureGeneration = ++this.captureGeneration;
      this.configureMediaRecorder(this.mediaRecorder, captureGeneration);
      this.mediaRecorder.start(this.dataTimesliceMs);
      this.applyTransition("start", { durationMs: 0, peakLevel: 0, result: null, error: null });
      this.startDurationTimer();
    } catch (error) {
      const mapped = mapAudioRecorderError(error);
      await this.fail(mapped);
      throw mapped;
    }
  }

  pause(): void {
    if (this.snapshot.status !== "recording" || !this.mediaRecorder) throw new AudioRecorderError("invalid-state");
    try {
      this.mediaRecorder.pause();
      this.captureActiveDuration();
      this.applyTransition("pause", { durationMs: this.activeDurationMs, inputLevel: 0 });
    } catch (error) {
      void this.fail(mapAudioRecorderError(error));
      throw mapAudioRecorderError(error);
    }
  }

  resume(): void {
    if (this.snapshot.status !== "paused" || !this.mediaRecorder) throw new AudioRecorderError("invalid-state");
    try {
      this.mediaRecorder.resume();
      this.activeStartedAt = this.dependencies.now();
      this.applyTransition("resume");
    } catch (error) {
      void this.fail(mapAudioRecorderError(error));
      throw mapAudioRecorderError(error);
    }
  }

  stop(): Promise<RecordedAudio> {
    if ((this.snapshot.status !== "recording" && this.snapshot.status !== "paused") || !this.mediaRecorder) {
      return Promise.reject(new AudioRecorderError("invalid-state"));
    }
    this.captureActiveDuration();
    this.stopDurationTimer();
    this.applyTransition("stop", { durationMs: this.activeDurationMs, inputLevel: 0 });
    return new Promise<RecordedAudio>((resolve, reject) => {
      this.pendingStop = { resolve, reject };
      try {
        this.mediaRecorder?.stop();
      } catch (error) {
        void this.fail(mapAudioRecorderError(error));
      }
    });
  }

  async rerecord(): Promise<void> {
    await this.reset();
    await this.start();
  }

  async cancel(): Promise<void> {
    this.permissionGeneration += 1;
    this.captureGeneration += 1;
    const cancellation = new AudioRecorderError("cancelled");
    this.pendingStop?.reject(cancellation);
    this.pendingStop = null;
    await this.resetResources();
    this.discardPreview();
    this.applyTransition("cancel", {
      durationMs: 0,
      inputLevel: 0,
      peakLevel: 0,
      hasLiveStream: false,
      result: null,
      error: null,
    });
  }

  async reset(): Promise<void> {
    this.permissionGeneration += 1;
    this.captureGeneration += 1;
    this.pendingStop?.reject(new AudioRecorderError("cancelled"));
    this.pendingStop = null;
    await this.resetResources();
    this.discardPreview();
    this.applyTransition("reset", { ...initialRecorderSnapshot });
  }

  async dispose(): Promise<void> {
    this.permissionGeneration += 1;
    this.captureGeneration += 1;
    this.pendingStop?.reject(new AudioRecorderError("cancelled"));
    this.pendingStop = null;
    await this.resetResources();
    this.discardPreview();
    this.snapshot = initialRecorderSnapshot;
  }

  private applyTransition(event: RecorderEvent, patch: Partial<RecorderSnapshot> = {}): void {
    const nextStatus = transitionRecorderStatus(this.snapshot.status, event);
    if (!nextStatus) throw new AudioRecorderError("invalid-state");
    this.publish({ ...patch, status: nextStatus });
  }

  private publish(patch: Partial<RecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private configureMediaRecorder(recorder: MediaRecorderLike, captureGeneration: number): void {
    recorder.ondataavailable = (event) => {
      if (captureGeneration === this.captureGeneration && event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      if (captureGeneration !== this.captureGeneration) return;
      const possibleError = "error" in event ? (event as Event & { error?: unknown }).error : event;
      void this.fail(mapAudioRecorderError(possibleError));
    };
    recorder.onstop = () => {
      if (captureGeneration === this.captureGeneration) void this.finishRecording(captureGeneration);
    };
  }

  private async finishRecording(captureGeneration: number): Promise<void> {
    const durationMs = Math.round(this.activeDurationMs);
    const peakLevel = this.snapshot.peakLevel;
    const mimeType = this.mediaRecorder?.mimeType || this.chunks[0]?.type || "audio/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    await this.resetResources(false);
    if (captureGeneration !== this.captureGeneration) return;

    if (durationMs < this.minDurationMs) {
      await this.fail(new AudioRecorderError("too-short"), false);
      return;
    }
    if (blob.size === 0) {
      await this.fail(new AudioRecorderError("empty-recording"), false);
      return;
    }
    if (this.meterSupported && peakLevel < this.silenceThreshold) {
      await this.fail(new AudioRecorderError("silent-input"), false);
      return;
    }

    this.previewUrl = this.dependencies.createObjectURL(blob);
    const result: RecordedAudio = {
      blob,
      durationMs,
      durationSeconds: durationMs / 1_000,
      mimeType,
      previewUrl: this.previewUrl,
      peakLevel,
    };
    this.applyTransition("complete", { durationMs, hasLiveStream: false, inputLevel: 0, result, error: null });
    this.pendingStop?.resolve(result);
    this.pendingStop = null;
  }

  private async fail(error: AudioRecorderError, cleanResources = true): Promise<void> {
    this.permissionGeneration += 1;
    this.captureGeneration += 1;
    if (cleanResources) await this.resetResources();
    const pendingStop = this.pendingStop;
    this.pendingStop = null;
    if (transitionRecorderStatus(this.snapshot.status, "fail")) {
      this.applyTransition("fail", { hasLiveStream: false, inputLevel: 0, result: null, error: error.toInfo() });
    } else {
      this.publish({ status: "error", hasLiveStream: false, inputLevel: 0, result: null, error: error.toInfo() });
    }
    pendingStop?.reject(error);
  }

  private async startMeter(stream: MediaStream): Promise<void> {
    this.meterSupported = false;
    try {
      this.meter = await this.dependencies.meterFactory(stream, (inputLevel) => {
        const normalizedLevel = Math.min(1, Math.max(0, inputLevel));
        const peakLevel = this.snapshot.status === "recording" ? Math.max(this.snapshot.peakLevel, normalizedLevel) : this.snapshot.peakLevel;
        this.publish({ inputLevel: normalizedLevel, peakLevel });
      });
      this.meterSupported = this.meter.supported;
    } catch {
      this.meter = null;
      this.meterSupported = false;
    }
  }

  private attachTrackEndedListeners(stream: MediaStream): void {
    stream.getAudioTracks().forEach((track) => {
      const onEnded = () => {
        if (this.suppressTrackEnded) return;
        if (this.snapshot.status === "ready" || this.snapshot.status === "recording" || this.snapshot.status === "paused") {
          void this.fail(new AudioRecorderError("recording-interrupted"));
        }
      };
      track.addEventListener("ended", onEnded);
      this.trackEndedListeners.set(track, onEnded);
    });
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationTimer = setInterval(() => {
      if (this.snapshot.status !== "recording") return;
      this.publish({ durationMs: Math.round(this.currentDurationMs()) });
    }, 100);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer !== null) clearInterval(this.durationTimer);
    this.durationTimer = null;
  }

  private currentDurationMs(): number {
    if (this.activeStartedAt === null) return this.activeDurationMs;
    return this.activeDurationMs + Math.max(0, this.dependencies.now() - this.activeStartedAt);
  }

  private captureActiveDuration(): void {
    this.activeDurationMs = this.currentDurationMs();
    this.activeStartedAt = null;
  }

  private async resetResources(stopRecorder = true): Promise<void> {
    this.stopDurationTimer();
    this.suppressTrackEnded = true;
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (stopRecorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* The recorder is already shutting down. */ }
      }
    }
    for (const [track, listener] of this.trackEndedListeners) track.removeEventListener("ended", listener);
    this.trackEndedListeners.clear();
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
    const meter = this.meter;
    this.meter = null;
    if (meter) await meter.dispose();
    this.suppressTrackEnded = false;
    this.activeStartedAt = null;
    this.publish({ hasLiveStream: false, inputLevel: 0 });
  }

  private discardPreview(): void {
    if (this.previewUrl) this.dependencies.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }
}
