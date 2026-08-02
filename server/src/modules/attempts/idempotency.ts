import { createHash } from "node:crypto";
import { IdempotencyRepository, type IdempotencyRecord } from "../../db/repositories.js";
import { AttemptApiError } from "./errors.js";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export function requestFingerprint(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}

export class IdempotencyService {
  constructor(
    private readonly repository: IdempotencyRepository,
    private readonly clock: () => Date,
  ) {}

  find(input: {
    ownerId: string;
    method: string;
    route: string;
    key: string;
    fingerprint: string;
  }): IdempotencyRecord | null {
    const record = this.repository.find({ ...input, now: this.clock().toISOString() });
    if (!record) return null;
    if (record.fingerprint !== input.fingerprint) {
      throw new AttemptApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "该 Idempotency-Key 已用于不同请求，请生成新键后重试。",
      );
    }
    return record;
  }

  save(input: {
    ownerId: string;
    method: string;
    route: string;
    key: string;
    fingerprint: string;
    responseStatus: number;
    responseBody: string;
  }): void {
    const now = this.clock();
    this.repository.save({
      ...input,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS).toISOString(),
    });
  }
}
