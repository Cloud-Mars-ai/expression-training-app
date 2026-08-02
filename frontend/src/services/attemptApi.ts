import type {
  ApiError,
  Attempt,
  AttemptDetail,
  ClientManagedAttemptStatus,
  CreateAttemptRequest,
  GetAttemptResponse,
  RequestEvaluationRequest,
  Transcript,
  TranscriptSegmentEdit,
  SubmitTextAnswerRequest,
} from "@expression-training/contracts";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/u, "")
  ?? "http://127.0.0.1:8787";
const DEMO_OWNER_ID = "demo-user";

export class AttemptApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly statusCode: number,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AttemptApiError";
  }
}

export function createIdempotencyKey(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `request-${Date.now()}-${Math.random()}`;
}

export async function createRemoteAttempt(body: CreateAttemptRequest, idempotencyKey: string): Promise<Attempt> {
  return request<Attempt>("/v1/attempts", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

export async function updateRemoteAttemptStatus(
  attemptId: string,
  expectedStatusVersion: number,
  status: ClientManagedAttemptStatus,
): Promise<Attempt> {
  return request<Attempt>(`/v1/attempts/${attemptId}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedStatusVersion, status, clientEventAt: new Date().toISOString() }),
  });
}

export async function getRemoteAttempt(attemptId: string, signal?: AbortSignal): Promise<AttemptDetail> {
  return request<AttemptDetail>(`/v1/attempts/${attemptId}`, { method: "GET", signal });
}

export async function uploadAttemptAudio(input: {
  attemptId: string;
  blob: Blob;
  durationMs: number;
  mimeType: string;
  idempotencyKey: string;
}): Promise<Attempt> {
  const mimeType = normalizeAudioMimeType(input.mimeType || input.blob.type);
  const sha256 = await sha256Hex(input.blob);
  const form = new FormData();
  form.append("audio", input.blob, `attempt-${input.attemptId}.${extensionForMimeType(mimeType)}`);
  form.append("metadata", JSON.stringify({
    durationMs: Math.max(1, Math.round(input.durationMs)),
    mimeType,
    byteSize: input.blob.size,
    sha256,
    clientRecordedAt: new Date().toISOString(),
  }));
  return request<Attempt>(`/v1/attempts/${input.attemptId}/audio`, {
    method: "POST",
    headers: { "idempotency-key": input.idempotencyKey },
    body: form,
  });
}

export async function submitAttemptText(attemptId: string, text: string): Promise<Transcript> {
  const body: SubmitTextAnswerRequest = { text, clientSubmittedAt: new Date().toISOString() };
  return request<Transcript>(`/v1/attempts/${attemptId}/text`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function reviewRemoteTranscript(
  attemptId: string,
  baseRevision: number,
  segments: TranscriptSegmentEdit[],
): Promise<Transcript> {
  return request<Transcript>(`/v1/attempts/${attemptId}/transcript`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseRevision, segments }),
  });
}

export async function requestRemoteEvaluation(
  attemptId: string,
  body: RequestEvaluationRequest,
  idempotencyKey: string,
): Promise<Attempt> {
  return request<Attempt>(`/v1/attempts/${attemptId}/evaluation`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

export async function deleteRemoteAttempt(attemptId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/attempts/${encodeURIComponent(attemptId)}`, {
    method: "DELETE",
    headers: { "x-demo-user-id": DEMO_OWNER_ID },
  });
  if (response.ok) return;
  await throwResponseError(response);
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "x-demo-user-id": DEMO_OWNER_ID, ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AttemptApiError("NETWORK_ERROR", "无法连接本地分析服务，请确认服务端已经启动。", true, 0);
  }
  if (!response.ok) await throwResponseError(response);
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as GetAttemptResponse | { data: T };
  return payload.data as T;
}

async function throwResponseError(response: Response): Promise<never> {
  let payload: ApiError | null = null;
  try { payload = await response.json() as ApiError; } catch { /* use fallback */ }
  const fieldDetail = payload?.error.fieldErrors ? Object.values(payload.error.fieldErrors)[0] : undefined;
  throw new AttemptApiError(
    payload?.error.code ?? "HTTP_ERROR",
    `${payload?.error.message ?? `本地服务返回了 ${response.status}。`}${fieldDetail ? ` ${fieldDetail}` : ""}`,
    payload?.error.retryable ?? response.status >= 500,
    response.status,
    payload?.error.fieldErrors,
  );
}

async function sha256Hex(blob: Blob): Promise<string> {
  if (!crypto.subtle) throw new AttemptApiError("CRYPTO_UNAVAILABLE", "当前浏览器无法计算录音摘要。", false, 0);
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeAudioMimeType(value: string): string {
  const mime = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime === "video/webm") return "audio/webm";
  if (mime === "audio/x-wav" || mime === "audio/wave") return "audio/wav";
  return mime;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/wav") return "wav";
  return "webm";
}
