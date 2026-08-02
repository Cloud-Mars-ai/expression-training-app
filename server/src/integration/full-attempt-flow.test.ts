import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Evaluation, EvidenceReference, Transcript } from "@expression-training/contracts";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  MockEvaluationProvider,
  MockTranscriptionProvider,
  ProviderTechnicalError,
  type EvaluationProvider,
  type TranscriptionProvider,
} from "../providers/index.js";

const OWNER = "integration-user";
const RUBRIC_VERSION = "structured-expression-l2-v1";
const TEST_ROOT = fileURLToPath(new URL("../../var/test/integration/", import.meta.url));

type TestContext = {
  app: FastifyInstance;
  directory: string;
  uploadsPath: string;
};

const contexts: TestContext[] = [];

afterEach(async () => {
  for (const context of contexts.splice(0)) {
    await context.app.close();
    await rm(context.directory, { recursive: true, force: true });
  }
});

describe("真实 Attempt API 最小闭环", () => {
  it("从创建、上传、转写校对、证据化评分到删除形成完整闭环", async () => {
    const context = await createTestContext();
    const attemptId = await createRecordingAttempt(context.app);

    const upload = await uploadWav(context.app, attemptId, createWav(60_000));
    expect(upload.statusCode).toBe(202);
    expect(upload.json().data.status).toBe("transcribing");

    const transcriptReady = await pollAttempt(context.app, attemptId, "transcript-review");
    const providerDraft = transcriptReady.transcript as Transcript;
    expect(providerDraft).toMatchObject({
      attemptId,
      status: "provider-draft",
      revision: 1,
      language: "zh-CN",
    });
    expect(providerDraft.confidence).toBeGreaterThan(0.8);
    expect(providerDraft.segments.length).toBeGreaterThan(0);

    const editedSegmentId = providerDraft.segments[1]?.id;
    expect(editedSegmentId).toBeTruthy();
    const review = await context.app.inject({
      method: "PATCH",
      url: `/v1/attempts/${attemptId}/transcript`,
      headers: ownerHeaders(),
      payload: {
        baseRevision: providerDraft.revision,
        segments: providerDraft.segments.map((segment) => ({
          segmentId: segment.id,
          text: segment.id === editedSegmentId ? `${segment.text}这是我负责推进的具体部分。` : segment.text,
        })),
      },
    });
    expect(review.statusCode).toBe(200);
    const reviewed = review.json().data as Transcript;
    expect(reviewed).toMatchObject({ status: "user-reviewed", revision: 2 });
    expect(reviewed.fullText).toContain("这是我负责推进的具体部分");

    const evaluationRequest = await context.app.inject({
      method: "POST",
      url: `/v1/attempts/${attemptId}/evaluation`,
      headers: ownerHeaders(randomUUID()),
      payload: { transcriptRevision: reviewed.revision, rubricVersion: RUBRIC_VERSION },
    });
    expect(evaluationRequest.statusCode).toBe(202);
    expect(evaluationRequest.json().data.status).toBe("evaluating");

    const ready = await pollAttempt(context.app, attemptId, "ready");
    expect(ready.attempt).toMatchObject({
      status: "ready",
      progressDisposition: "counted",
      failure: null,
    });
    expect(ready.transcript).toMatchObject({ status: "user-reviewed", revision: 2 });
    const evaluation = ready.evaluation as Evaluation;
    expect(evaluation.status).toBe("scorable");
    if (evaluation.status !== "scorable") throw new Error("Expected a scorable evaluation.");

    expect(evaluation).toMatchObject({
      attemptId,
      transcriptId: reviewed.id,
      transcriptRevision: reviewed.revision,
      rubricVersion: RUBRIC_VERSION,
      countsTowardProgress: true,
      policyChecks: {
        transcriptEvidenceOnly: true,
        prohibitedInferenceChecked: true,
      },
    });
    expect(evaluation.confidence).toBeGreaterThan(0);
    expect(evaluation.overall.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.overall.score).toBeLessThanOrEqual(100);
    expect(evaluation.strength.evidence.length).toBeGreaterThan(0);
    expect(evaluation.priorityIssue.evidence.length).toBeGreaterThan(0);
    expect(evaluation.priorityIssue.id).toBe(evaluation.retryPlan.focusIssueId);
    expect(evaluation.improvedExample.preservesUserIntent).toBe(true);
    expect(evaluation.dimensions.map(({ id }) => id)).toEqual([
      "task-fulfillment",
      "structure",
      "relevance",
      "evidence",
      "concision",
      "delivery",
    ]);

    const allEvidence = [
      ...evaluation.strength.evidence,
      ...evaluation.priorityIssue.evidence,
      ...evaluation.dimensions.flatMap((dimension) => dimension.evidence),
    ];
    expect(allEvidence.length).toBeGreaterThanOrEqual(8);
    for (const evidence of allEvidence) assertEvidenceMatchesTranscript(evidence, reviewed);

    const deleteResponse = await context.app.inject({
      method: "DELETE",
      url: `/v1/attempts/${attemptId}`,
      headers: ownerHeaders(),
    });
    expect(deleteResponse.statusCode).toBe(204);
    const deletedRead = await context.app.inject({
      method: "GET",
      url: `/v1/attempts/${attemptId}`,
      headers: ownerHeaders(),
    });
    expect(deletedRead.statusCode).toBe(410);
    expect(deletedRead.json().error.code).toBe("GONE");
    expect(await containsAudioFile(context.uploadsPath)).toBe(false);
  });

  it("转写技术失败不生成低分，也不计入有效练习", async () => {
    const context = await createTestContext({
      transcriptionProvider: new MockTranscriptionProvider({
        failWith: { message: "模拟 ASR 暂时不可用", retryable: true },
      }),
    });
    const attemptId = await createRecordingAttempt(context.app);
    const upload = await uploadWav(context.app, attemptId, createWav(5_000));
    expect(upload.statusCode).toBe(202);

    const failed = await pollAttempt(context.app, attemptId, "technical-failure");
    expect(failed.attempt).toMatchObject({
      status: "technical-failure",
      progressDisposition: "not-counted",
      evaluationId: null,
      failure: {
        code: "transcription-provider-failure",
        stage: "transcribing",
        retryable: true,
      },
    });
    expect(failed.transcript).toBeNull();
    expect(failed.evaluation).toBeNull();
    expect(JSON.stringify(failed)).not.toContain("overallScore");
    expect(JSON.stringify(failed)).not.toContain('"score"');
  });

  it("评分服务技术失败保留校对文本，但不生成低分或有效次数", async () => {
    const context = await createTestContext({
      evaluationProvider: new MockEvaluationProvider({
        failWith: { message: "模拟评分服务暂时不可用", retryable: true },
      }),
    });
    const attemptId = await createRecordingAttempt(context.app);
    await uploadWav(context.app, attemptId, createWav(5_000));
    const transcriptReady = await pollAttempt(context.app, attemptId, "transcript-review");
    const transcript = transcriptReady.transcript as Transcript;
    const review = await reviewWithoutChanges(context.app, attemptId, transcript);

    const requestEvaluation = await context.app.inject({
      method: "POST",
      url: `/v1/attempts/${attemptId}/evaluation`,
      headers: ownerHeaders(randomUUID()),
      payload: { transcriptRevision: review.revision, rubricVersion: RUBRIC_VERSION },
    });
    expect(requestEvaluation.statusCode).toBe(202);

    const failed = await pollAttempt(context.app, attemptId, "technical-failure");
    expect(failed.attempt).toMatchObject({
      status: "technical-failure",
      progressDisposition: "not-counted",
      evaluationId: null,
      failure: {
        code: "evaluation-provider-failure",
        stage: "evaluating",
        retryable: true,
      },
    });
    expect(failed.transcript).toMatchObject({ status: "user-reviewed", revision: 2 });
    expect(failed.evaluation).toBeNull();
    expect(JSON.stringify(failed)).not.toContain('"score"');
  });

  it("评分技术失败后可以复用已确认转写重新分析", async () => {
    const fallback = new MockEvaluationProvider();
    let calls = 0;
    const evaluationProvider: EvaluationProvider = {
      providerId: "fail-once-evaluation",
      async evaluate(request, signal) {
        calls += 1;
        if (calls === 1) {
          throw new ProviderTechnicalError("evaluation", "模拟首次评分失败。", { retryable: true });
        }
        return fallback.evaluate(request, signal);
      },
    };
    const context = await createTestContext({ evaluationProvider });
    const attemptId = await createRecordingAttempt(context.app);
    await uploadWav(context.app, attemptId, createWav(5_000));
    const transcriptReady = await pollAttempt(context.app, attemptId, "transcript-review");
    const reviewed = await reviewWithoutChanges(context.app, attemptId, transcriptReady.transcript as Transcript);

    const firstRequest = await context.app.inject({
      method: "POST",
      url: `/v1/attempts/${attemptId}/evaluation`,
      headers: ownerHeaders(randomUUID()),
      payload: { transcriptRevision: reviewed.revision, rubricVersion: RUBRIC_VERSION },
    });
    expect(firstRequest.statusCode).toBe(202);
    const failed = await pollAttempt(context.app, attemptId, "technical-failure");
    expect(failed.attempt.failure).toMatchObject({ stage: "evaluating", retryable: true });

    const retryRequest = await context.app.inject({
      method: "POST",
      url: `/v1/attempts/${attemptId}/evaluation`,
      headers: ownerHeaders(randomUUID()),
      payload: { transcriptRevision: reviewed.revision, rubricVersion: RUBRIC_VERSION },
    });
    expect(retryRequest.statusCode).toBe(202);
    const ready = await pollAttempt(context.app, attemptId, "ready");
    expect(ready.attempt).toMatchObject({ status: "ready", progressDisposition: "counted", failure: null });
    expect(ready.evaluation).toMatchObject({ status: "scorable" });
    expect(calls).toBe(2);
  });
});

async function createTestContext(options: {
  transcriptionProvider?: TranscriptionProvider;
  evaluationProvider?: EvaluationProvider;
} = {}): Promise<TestContext> {
  const directory = join(TEST_ROOT, randomUUID());
  const uploadsPath = join(directory, "uploads");
  await mkdir(uploadsPath, { recursive: true });
  const app = await createApp({
    databasePath: join(directory, "integration.sqlite"),
    uploadsPath,
    ...(options.transcriptionProvider ? { transcriptionProvider: options.transcriptionProvider } : {}),
    ...(options.evaluationProvider ? { evaluationProvider: options.evaluationProvider } : {}),
  });
  const context = { app, directory, uploadsPath };
  contexts.push(context);
  return context;
}

async function createRecordingAttempt(app: FastifyInstance): Promise<string> {
  const created = await app.inject({
    method: "POST",
    url: "/v1/attempts",
    headers: ownerHeaders(randomUUID()),
    payload: {
      exerciseId: "exercise-project-contribution-l2",
      exerciseVersionId: "exercise-project-contribution-l2-v1",
      frameworkId: "STAR",
      locale: "zh-CN",
      clientTimeZone: "Asia/Shanghai",
    },
  });
  expect(created.statusCode).toBe(201);
  const attemptId = created.json().data.id as string;

  const permission = await app.inject({
    method: "PATCH",
    url: `/v1/attempts/${attemptId}/status`,
    headers: ownerHeaders(),
    payload: {
      expectedStatusVersion: 1,
      status: "permission-check",
      clientEventAt: new Date().toISOString(),
    },
  });
  expect(permission.statusCode).toBe(200);

  const recording = await app.inject({
    method: "PATCH",
    url: `/v1/attempts/${attemptId}/status`,
    headers: ownerHeaders(),
    payload: {
      expectedStatusVersion: 2,
      status: "recording",
      clientEventAt: new Date().toISOString(),
    },
  });
  expect(recording.statusCode).toBe(200);
  return attemptId;
}

async function reviewWithoutChanges(
  app: FastifyInstance,
  attemptId: string,
  transcript: Transcript,
): Promise<Transcript> {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/attempts/${attemptId}/transcript`,
    headers: ownerHeaders(),
    payload: {
      baseRevision: transcript.revision,
      segments: transcript.segments.map((segment) => ({ segmentId: segment.id, text: segment.text })),
    },
  });
  expect(response.statusCode).toBe(200);
  return response.json().data as Transcript;
}

async function pollAttempt(
  app: FastifyInstance,
  attemptId: string,
  expectedStatus: string,
): Promise<Record<string, any>> {
  let last: Record<string, any> | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/attempts/${attemptId}`,
      headers: ownerHeaders(),
    });
    expect(response.statusCode).toBe(200);
    last = response.json().data as Record<string, any>;
    if (last.attempt?.status === expectedStatus) return last;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Attempt 未在测试时间内进入 ${expectedStatus}，最后状态：${last?.attempt?.status ?? "unknown"}`);
}

async function uploadWav(app: FastifyInstance, attemptId: string, wav: Buffer) {
  const boundary = `----integration-${randomUUID()}`;
  const metadata = JSON.stringify({
    durationMs: readWavDuration(wav),
    mimeType: "audio/wav",
    byteSize: wav.length,
    sha256: createHash("sha256").update(wav).digest("hex"),
    clientRecordedAt: new Date().toISOString(),
  });
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    ),
    wav,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: "POST",
    url: `/v1/attempts/${attemptId}/audio`,
    headers: {
      ...ownerHeaders(randomUUID()),
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(payload.length),
    },
    payload,
  });
}

function assertEvidenceMatchesTranscript(evidence: EvidenceReference, transcript: Transcript): void {
  expect(evidence.transcriptId).toBe(transcript.id);
  expect(evidence.transcriptRevision).toBe(transcript.revision);
  expect(evidence.segmentIds.length).toBeGreaterThan(0);
  const referenced = evidence.segmentIds.map((id) => transcript.segments.find((segment) => segment.id === id));
  expect(referenced.every(Boolean)).toBe(true);
  const segments = referenced.filter((segment) => segment !== undefined);
  expect(evidence.startMs).toBe(Math.min(...segments.map((segment) => segment.startMs)));
  expect(evidence.endMs).toBe(Math.max(...segments.map((segment) => segment.endMs)));
  expect(segments.map((segment) => segment.text).join("")).toContain(evidence.quote);
  expect(evidence.observation.trim().length).toBeGreaterThan(0);
}

function ownerHeaders(idempotencyKey?: string): Record<string, string> {
  return {
    "x-demo-user-id": OWNER,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
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

async function containsAudioFile(root: string): Promise<boolean> {
  try {
    return (await readdir(root, { recursive: true })).some((name) => /\.(wav|webm|ogg|m4a)$/u.test(name));
  } catch {
    return false;
  }
}
