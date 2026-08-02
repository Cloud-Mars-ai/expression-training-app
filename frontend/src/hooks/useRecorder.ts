import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { isRecorderNavigationUnsafe } from "../features/recording/recorderMachine";
import { BrowserAudioRecorder, type BrowserAudioRecorderOptions } from "../services/audioRecorder";

export function formatRecordingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useRecorder(options?: BrowserAudioRecorderOptions) {
  const [recorder] = useState(() => new BrowserAudioRecorder(options));
  const snapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot, recorder.getSnapshot);

  useEffect(() => () => { void recorder.dispose(); }, [recorder]);

  useEffect(() => {
    if (!isRecorderNavigationUnsafe(snapshot.status)) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [snapshot.status]);

  const requestPermission = useCallback(() => recorder.requestPermission(), [recorder]);
  const start = useCallback(() => recorder.start(), [recorder]);
  const pause = useCallback(() => recorder.pause(), [recorder]);
  const resume = useCallback(() => recorder.resume(), [recorder]);
  const stop = useCallback(() => recorder.stop(), [recorder]);
  const rerecord = useCallback(() => recorder.rerecord(), [recorder]);
  const cancel = useCallback(() => recorder.cancel(), [recorder]);
  const reset = useCallback(() => recorder.reset(), [recorder]);

  return {
    ...snapshot,
    formattedDuration: formatRecordingDuration(snapshot.durationMs),
    isNavigationUnsafe: isRecorderNavigationUnsafe(snapshot.status),
    requestPermission,
    start,
    pause,
    resume,
    stop,
    rerecord,
    cancel,
    reset,
  };
}

export type UseRecorderReturn = ReturnType<typeof useRecorder>;
