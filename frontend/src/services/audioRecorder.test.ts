// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioMeterFactory } from "./audioMeter";
import { AudioRecorderError } from "./audioErrors";
import { BrowserAudioRecorder, type MediaRecorderConstructor } from "./audioRecorder";

class FakeTrack extends EventTarget {
  readonly stop = vi.fn();

  interrupt() {
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  readonly mimeType: string;
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  readonly start = vi.fn(() => { this.state = "recording"; });
  readonly pause = vi.fn(() => { this.state = "paused"; });
  readonly resume = vi.fn(() => { this.state = "recording"; });
  readonly stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded-audio"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.(new Event("stop"));
  });

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }
}

function makeStream(track: FakeTrack): MediaStream {
  return {
    getAudioTracks: () => [track as unknown as MediaStreamTrack],
    getTracks: () => [track as unknown as MediaStreamTrack],
  } as MediaStream;
}

function makeHarness(options: { meterSupported?: boolean; getUserMediaError?: unknown; minDurationMs?: number } = {}) {
  let clock = 0;
  let reportLevel: ((level: number) => void) | undefined;
  const track = new FakeTrack();
  const stream = makeStream(track);
  const meterDispose = vi.fn(async () => undefined);
  const meterFactory: AudioMeterFactory = vi.fn(async (_stream, onLevel) => {
    reportLevel = onLevel;
    return { supported: options.meterSupported ?? true, dispose: meterDispose };
  });
  const getUserMedia = options.getUserMediaError
    ? vi.fn(async () => { throw options.getUserMediaError; })
    : vi.fn(async () => stream);
  const createObjectURL = vi.fn(() => "blob:recording-preview");
  const revokeObjectURL = vi.fn();
  const recorder = new BrowserAudioRecorder({
    minDurationMs: options.minDurationMs ?? 1_000,
    dependencies: {
      mediaDevices: { getUserMedia } as Pick<MediaDevices, "getUserMedia">,
      MediaRecorder: FakeMediaRecorder as unknown as MediaRecorderConstructor,
      meterFactory,
      now: () => clock,
      createObjectURL,
      revokeObjectURL,
    },
  });

  return {
    recorder,
    track,
    getUserMedia,
    meterDispose,
    createObjectURL,
    revokeObjectURL,
    setTime(value: number) { clock = value; },
    reportLevel(value: number) { reportLevel?.(value); },
  };
}

describe("BrowserAudioRecorder", () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.isTypeSupported.mockClear();
  });

  it("requests permission and records through pause, resume and stop", async () => {
    const harness = makeHarness();
    await harness.recorder.requestPermission();
    expect(harness.recorder.getSnapshot().status).toBe("ready");
    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
      video: false,
    });

    await harness.recorder.start();
    expect(harness.recorder.getSnapshot().status).toBe("recording");
    harness.reportLevel(0.24);
    expect(harness.recorder.getSnapshot().inputLevel).toBe(0.24);

    harness.setTime(900);
    harness.recorder.pause();
    expect(harness.recorder.getSnapshot().status).toBe("paused");
    harness.setTime(1_300);
    harness.recorder.resume();
    harness.setTime(2_000);
    const result = await harness.recorder.stop();

    expect(result.durationMs).toBe(1_600);
    expect(result.durationSeconds).toBe(1.6);
    expect(result.mimeType).toBe("audio/webm;codecs=opus");
    expect(result.previewUrl).toBe("blob:recording-preview");
    expect(result.blob.size).toBeGreaterThan(0);
    expect(harness.recorder.getSnapshot().status).toBe("recorded");
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.meterDispose).toHaveBeenCalledOnce();

    await harness.recorder.reset();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith("blob:recording-preview");
    expect(harness.recorder.getSnapshot().status).toBe("idle");
  });

  it("maps microphone permission rejection and leaves no live stream", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const harness = makeHarness({ getUserMediaError: denied });
    await expect(harness.recorder.requestPermission()).rejects.toMatchObject({ code: "permission-denied" });
    expect(harness.recorder.getSnapshot()).toMatchObject({ status: "error", hasLiveStream: false });
    expect(harness.recorder.getSnapshot().error?.code).toBe("permission-denied");
  });

  it("reports a missing audio track as no microphone device", async () => {
    const streamWithoutAudio = {
      getAudioTracks: () => [],
      getTracks: () => [],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => streamWithoutAudio);
    const recorder = new BrowserAudioRecorder({
      dependencies: {
        mediaDevices: { getUserMedia } as Pick<MediaDevices, "getUserMedia">,
        MediaRecorder: FakeMediaRecorder as unknown as MediaRecorderConstructor,
      },
    });
    await expect(recorder.requestPermission()).rejects.toMatchObject({ code: "no-device" });
    expect(recorder.getSnapshot().error?.code).toBe("no-device");
  });

  it("rejects recordings that are too short and cleans capture resources", async () => {
    const harness = makeHarness({ minDurationMs: 1_500 });
    await harness.recorder.start();
    harness.reportLevel(0.4);
    harness.setTime(700);
    await expect(harness.recorder.stop()).rejects.toMatchObject({ code: "too-short" });
    expect(harness.recorder.getSnapshot().status).toBe("error");
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects silent input when an audio meter is available", async () => {
    const harness = makeHarness();
    await harness.recorder.start();
    harness.setTime(2_000);
    await expect(harness.recorder.stop()).rejects.toMatchObject({ code: "silent-input" });
    expect(harness.recorder.getSnapshot().error?.code).toBe("silent-input");
    expect(harness.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not claim silence when the browser cannot provide a level meter", async () => {
    const harness = makeHarness({ meterSupported: false });
    await harness.recorder.start();
    harness.setTime(2_000);
    await expect(harness.recorder.stop()).resolves.toMatchObject({ durationMs: 2_000 });
    expect(harness.recorder.getSnapshot().status).toBe("recorded");
  });

  it("treats a device disconnect as a technical interruption", async () => {
    const harness = makeHarness();
    await harness.recorder.start();
    harness.track.interrupt();
    await vi.waitFor(() => expect(harness.recorder.getSnapshot().status).toBe("error"));
    expect(harness.recorder.getSnapshot().error?.code).toBe("recording-interrupted");
    expect(harness.recorder.getSnapshot().error?.message).toContain("不会计入有效练习");
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });

  it("cancels active capture and releases recorder, stream and meter", async () => {
    const harness = makeHarness();
    await harness.recorder.start();
    await harness.recorder.cancel();
    expect(harness.recorder.getSnapshot()).toMatchObject({ status: "cancelled", hasLiveStream: false, result: null });
    expect(FakeMediaRecorder.instances[0].stop).toHaveBeenCalledOnce();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.meterDispose).toHaveBeenCalledOnce();
  });

  it("revokes the previous preview before starting a rerecord", async () => {
    const harness = makeHarness();
    await harness.recorder.start();
    harness.reportLevel(0.3);
    harness.setTime(1_500);
    await harness.recorder.stop();

    await harness.recorder.rerecord();
    expect(harness.revokeObjectURL).toHaveBeenCalledWith("blob:recording-preview");
    expect(harness.getUserMedia).toHaveBeenCalledTimes(2);
    expect(harness.recorder.getSnapshot().status).toBe("recording");
    await harness.recorder.cancel();
  });

  it("returns a typed invalid-state error for unsupported controls", async () => {
    const harness = makeHarness();
    expect(() => harness.recorder.pause()).toThrow(AudioRecorderError);
    await expect(harness.recorder.stop()).rejects.toMatchObject({ code: "invalid-state" });
  });
});
