import type { ApiErrorCode } from "@expression-training/contracts";

export class AttemptApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly retryable = false,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AttemptApiError";
  }
}
