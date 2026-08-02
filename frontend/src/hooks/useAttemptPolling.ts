import type { AttemptDetail } from "@expression-training/contracts";
import { useCallback, useEffect, useState } from "react";
import { getRemoteAttempt } from "../services/attemptApi";

export function useAttemptPolling(
  attemptId: string | undefined,
  options: { enabled?: boolean; intervalMs?: number } = {},
) {
  const { enabled = true, intervalMs = 750 } = options;
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(attemptId));
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    if (!attemptId || !enabled) return;
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      try {
        const next = await getRemoteAttempt(attemptId, controller.signal);
        if (!active) return;
        setDetail(next);
        setError(null);
        setLoading(false);
        if (!["transcript-review", "ready", "unscorable", "technical-failure", "cancelled", "deleted"].includes(next.attempt.status)) {
          timer = window.setTimeout(poll, intervalMs);
        }
      } catch (cause) {
        if (!active || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause : new Error("读取训练状态失败。"));
        setLoading(false);
      }
    };
    void poll();
    return () => { active = false; controller?.abort(); if (timer) window.clearTimeout(timer); };
  }, [attemptId, enabled, intervalMs, refreshToken]);

  return { detail, error, loading, refresh };
}
