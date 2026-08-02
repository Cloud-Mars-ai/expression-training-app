export type ApiMeta = {
  requestId: string;
  serverTime: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "GONE"
  | "STATE_CONFLICT"
  | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "AUDIO_TOO_LARGE"
  | "AUDIO_TOO_SHORT"
  | "AUDIO_DURATION_MISMATCH"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    fieldErrors?: Record<string, string>;
  };
  meta: ApiMeta;
};

export const API_HEADERS = {
  actorId: "x-demo-user-id",
  idempotencyKey: "idempotency-key",
  requestId: "x-request-id",
} as const;

