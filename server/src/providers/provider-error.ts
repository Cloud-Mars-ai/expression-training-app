export type ProviderStage = "transcription" | "evaluation";

export class ProviderTechnicalError extends Error {
  readonly stage: ProviderStage;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    stage: ProviderStage,
    message: string,
    options: { retryable: boolean; cause?: unknown },
  ) {
    super(message);
    this.name = "ProviderTechnicalError";
    this.stage = stage;
    this.retryable = options.retryable;
    this.cause = options.cause;
  }
}
