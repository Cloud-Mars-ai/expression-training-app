import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type SqliteDatabase } from "../../db/database.js";
import { LocalAudioStorage, type AudioStorage } from "../uploads/storage.js";
import { attemptsRoutes } from "./routes.js";

const OWNER = "demo-user-a";
const OTHER_OWNER = "demo-user-b";
const TEST_ROOT = fileURLToPath(new URL("../../../var/test/", import.meta.url));

type TestContext = {
  app: FastifyInstance;
  database: SqliteDatabase;
  directory: string;
  uploadsDirectory: string;
};

let context: TestContext;

beforeEach(async () => {
  context = await createTestContext();
});

afterEach(async () => {
  await context.app.close();
  context.database.close();
  await rm(context.directory, { recursive: true, force: true });
});

describe("Attempt API", () => {
  it("requires the demo owner header", async () => {
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: { "idempotency-key": randomUUID() },
      payload: createBody(),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("creates attempts idempotently and rejects key reuse with a different request", async () => {
    const key = randomUUID();
    const first = await createAttempt(context.app, OWNER, key);
    const replay = await createAttempt(context.app, OWNER, key);
    const conflict = await context.app.inject({
      method: "POST",
      url: "/v1/attempts",
      headers: ownerHeaders(OWNER, key),
      payload: createBody({ exerciseId: "exercise-other" }),
    });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.body).toBe(first.body);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("isolates attempts by x-demo-user-id", async () => {
    const attemptId = await createAttemptId(context.app, OWNER);
    const response = await context.app.inject({
      method: "GET",
      url: `/v1/attempts/${attemptId}`,
      headers: ownerHeaders(OTHER_OWNER),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("enforces client transitions and optimistic statusVersion", async () => {
    const attemptId = await createAttemptId(context.app, OWNER);
    const permission = await updateStatus(context.app, attemptId, 1, "permission-check");
    const stale = await updateStatus(context.app, attemptId, 1, "recording");
    const recording = await updateStatus(context.app, attemptId, 2, "recording");
    const invalid = await updateStatus(context.app, attemptId, 3, "permission-check");

    expect(permission.statusCode).toBe(200);
    expect(permission.json().data).toMatchObject({ status: "permission-check", statusVersion: 2 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("STATE_CONFLICT");
    expect(recording.json().data).toMatchObject({ status: "recording", statusVersion: 3 });
    expect(invalid.statusCode).toBe(409);
  });

  it("validates SHA-256 without advancing an attempt", async () => {
    const attemptId = await createRecordingAttempt(context.app);
    const wav = createWav(1_200);
    const response = await uploadWav(context.app, attemptId, wav, {
      sha256: "0".repeat(64),
    });
    const detail = await getAttempt(context.app, attemptId);

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
    expect(detail.json().data.attempt.status).toBe("recording");
  });

  it("validates MIME, size, minimum duration, and declared duration", async () => {
    const unsupportedId = await createRecordingAttempt(context.app);
    const unsupported = await uploadRaw(context.app, unsupportedId, Buffer.from("not audio"), {
      mimeType: "audio/webm",
      multipartMimeType: "audio/webm",
      durationMs: 1_200,
    });

    const shortId = await createRecordingAttempt(context.app);
    const shortWav = createWav(500);
    const tooShort = await uploadWav(context.app, shortId, shortWav);

    const mismatchId = await createRecordingAttempt(context.app);
    const wav = createWav(1_200);
    const mismatch = await uploadWav(context.app, mismatchId, wav, { durationMs: 9_000 });

    const sizeId = await createRecordingAttempt(context.app);
    const sizeMismatch = await uploadWav(context.app, sizeId, wav, { byteSize: wav.length + 1 });

    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(tooShort.statusCode).toBe(400);
    expect(tooShort.json().error.code).toBe("AUDIO_TOO_SHORT");
    expect(mismatch.json().error.code).toBe("AUDIO_DURATION_MISMATCH");
    expect(sizeMismatch.json().error.code).toBe("INVALID_REQUEST");
  });

  it("stores valid audio and atomically advances uploading to transcribing", async () => {
    const attemptId = await createRecordingAttempt(context.app);
    const wav = createWav(1_250);
    const response = await uploadWav(context.app, attemptId, wav);
    const detail = await getAttempt(context.app, attemptId);

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({
      status: "transcribing",
      statusVersion: 5,
      progressDisposition: "pending",
      audio: {
        mimeType: "audio/wav",
        byteSize: wav.length,
        durationMs: 1_250,
        sha256: sha256(wav),
      },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data).toMatchObject({ transcript: null, evaluation: null });
    expect((await readdir(context.uploadsDirectory, { recursive: true })).some((name) => name.endsWith(".wav"))).toBe(true);
  });

  it("replays an audio upload and detects changed content with the same key", async () => {
    const attemptId = await createRecordingAttempt(context.app);
    const key = randomUUID();
    const clientRecordedAt = new Date().toISOString();
    const first = await uploadWav(context.app, attemptId, createWav(1_200), { clientRecordedAt }, key);
    const replay = await uploadWav(context.app, attemptId, createWav(1_200), { clientRecordedAt }, key);
    const conflict = await uploadWav(context.app, attemptId, createWav(1_300), { clientRecordedAt }, key);

    expect(replay.statusCode).toBe(202);
    expect(replay.body).toBe(first.body);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("soft-deletes the attempt, removes audio, and makes DELETE idempotent", async () => {
    const attemptId = await createRecordingAttempt(context.app);
    await uploadWav(context.app, attemptId, createWav(1_200));

    const firstDelete = await context.app.inject({
      method: "DELETE",
      url: `/v1/attempts/${attemptId}`,
      headers: ownerHeaders(OWNER),
    });
    const secondDelete = await context.app.inject({
      method: "DELETE",
      url: `/v1/attempts/${attemptId}`,
      headers: ownerHeaders(OWNER),
    });
    const detail = await getAttempt(context.app, attemptId);

    expect(firstDelete.statusCode).toBe(204);
    expect(secondDelete.statusCode).toBe(204);
    expect(detail.statusCode).toBe(410);
    expect(detail.json().error.code).toBe("GONE");
    expect((await readdir(context.uploadsDirectory, { recursive: true })).some((name) => name.endsWith(".wav"))).toBe(false);
  });

  it("records storage infrastructure errors as technical-failure without a score", async () => {
    await context.app.close();
    context.database.close();
    await rm(context.directory, { recursive: true, force: true });
    context = await createTestContext({
      storage: {
        put: async () => {
          throw new Error("disk unavailable");
        },
        delete: async () => undefined,
      },
    });
    const attemptId = await createRecordingAttempt(context.app);
    const upload = await uploadWav(context.app, attemptId, createWav(1_200));
    const detail = await getAttempt(context.app, attemptId);

    expect(upload.statusCode).toBe(500);
    expect(detail.json().data.attempt).toMatchObject({
      status: "technical-failure",
      progressDisposition: "not-counted",
      evaluationId: null,
      failure: { code: "upload-storage-failure", stage: "uploading", retryable: true },
    });
    expect(detail.json().data.evaluation).toBeNull();
  });

  it("only permits retryOfAttemptId references owned by the caller", async () => {
    const otherAttemptId = await createAttemptId(context.app, OTHER_OWNER);
    const response = await createAttempt(context.app, OWNER, randomUUID(), {
      retryOfAttemptId: otherAttemptId,
      focusIssueId: "issue-structure",
    });

    expect(response.statusCode).toBe(404);
  });
});

async function createTestContext(options: { storage?: AudioStorage } = {}): Promise<TestContext> {
  const directory = join(TEST_ROOT, `attempts-${randomUUID()}`);
  const uploadsDirectory = join(directory, "uploads");
  await mkdir(uploadsDirectory, { recursive: true });
  const database = openDatabase(join(directory, "test.sqlite"));
  const app = Fastify({ logger: false });
  await app.register(attemptsRoutes, {
    database,
    storage: options.storage ?? new LocalAudioStorage(uploadsDirectory),
  });
  await app.ready();
  return { app, database, directory, uploadsDirectory };
}

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exerciseId: "exercise-l2-project",
    exerciseVersionId: "exercise-l2-project-v1",
    frameworkId: "STAR",
    locale: "zh-CN",
    clientTimeZone: "Asia/Shanghai",
    ...overrides,
  };
}

function ownerHeaders(ownerId: string, idempotencyKey?: string): Record<string, string> {
  return {
    "x-demo-user-id": ownerId,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

async function createAttempt(
  app: FastifyInstance,
  ownerId: string,
  key = randomUUID(),
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/v1/attempts",
    headers: ownerHeaders(ownerId, key),
    payload: createBody(overrides),
  });
}

async function createAttemptId(app: FastifyInstance, ownerId: string): Promise<string> {
  const response = await createAttempt(app, ownerId);
  expect(response.statusCode).toBe(201);
  return response.json().data.id as string;
}

async function createRecordingAttempt(app: FastifyInstance): Promise<string> {
  const id = await createAttemptId(app, OWNER);
  expect((await updateStatus(app, id, 1, "permission-check")).statusCode).toBe(200);
  expect((await updateStatus(app, id, 2, "recording")).statusCode).toBe(200);
  return id;
}

async function updateStatus(
  app: FastifyInstance,
  attemptId: string,
  expectedStatusVersion: number,
  status: "permission-check" | "recording" | "cancelled",
) {
  return app.inject({
    method: "PATCH",
    url: `/v1/attempts/${attemptId}/status`,
    headers: ownerHeaders(OWNER),
    payload: { expectedStatusVersion, status, clientEventAt: new Date().toISOString() },
  });
}

async function getAttempt(app: FastifyInstance, attemptId: string) {
  return app.inject({ method: "GET", url: `/v1/attempts/${attemptId}`, headers: ownerHeaders(OWNER) });
}

async function uploadWav(
  app: FastifyInstance,
  attemptId: string,
  wav: Buffer,
  overrides: Record<string, unknown> = {},
  key = randomUUID(),
) {
  return uploadRaw(app, attemptId, wav, {
    mimeType: "audio/wav",
    multipartMimeType: "audio/wav",
    durationMs: readWavDuration(wav),
    ...overrides,
  }, key);
}

async function uploadRaw(
  app: FastifyInstance,
  attemptId: string,
  audio: Buffer,
  options: {
    mimeType: string;
    multipartMimeType: string;
    durationMs: number;
    byteSize?: number;
    sha256?: string;
    clientRecordedAt?: string;
  },
  key = randomUUID(),
) {
  const boundary = `----attempt-${randomUUID()}`;
  const metadata = JSON.stringify({
    durationMs: options.durationMs,
    mimeType: options.mimeType,
    byteSize: options.byteSize ?? audio.length,
    sha256: options.sha256 ?? sha256(audio),
    clientRecordedAt: options.clientRecordedAt ?? new Date().toISOString(),
  });
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\nContent-Type: ${options.multipartMimeType}\r\n\r\n`,
    ),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: "POST",
    url: `/v1/attempts/${attemptId}/audio`,
    headers: {
      ...ownerHeaders(OWNER, key),
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(payload.length),
    },
    payload,
  });
}

function createWav(durationMs: number): Buffer {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const sampleCount = Math.round((sampleRate * durationMs) / 1_000);
  const dataSize = sampleCount * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function readWavDuration(wav: Buffer): number {
  return Math.round((wav.readUInt32LE(40) / wav.readUInt32LE(28)) * 1_000);
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
