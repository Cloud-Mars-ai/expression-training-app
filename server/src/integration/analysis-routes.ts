import { randomUUID } from "node:crypto";
import type {
  ApiError,
  ApiSuccess,
  RequestEvaluationRequest,
  SubmitTextAnswerRequest,
  UpdateTranscriptRequest,
} from "@expression-training/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { IdempotencyRepository } from "../db/repositories.js";
import type { SqliteDatabase } from "../db/database.js";
import { AttemptApiError } from "../modules/attempts/errors.js";
import { IdempotencyService, requestFingerprint } from "../modules/attempts/idempotency.js";
import type { AnalysisPipeline } from "./analysis-pipeline.js";

const idSchema = z.string().min(1).max(200);
const paramsSchema = z.object({ id: idSchema });
const transcriptSchema = z.object({
  baseRevision: z.number().int().positive(),
  segments: z.array(z.object({ segmentId: idSchema, text: z.string().trim().min(1).max(2_000) })).min(1),
});
const evaluationSchema = z.object({
  transcriptRevision: z.number().int().positive(),
  rubricVersion: z.string().min(1).max(200),
});
const textAnswerSchema = z.object({
  text: z.string().trim().min(10).max(8_000),
  clientSubmittedAt: z.iso.datetime(),
});

export type AnalysisRoutesOptions = {
  database: SqliteDatabase;
  pipeline: AnalysisPipeline;
  clock?: () => Date;
};

export const analysisRoutes: FastifyPluginAsync<AnalysisRoutesOptions> = async (app, options) => {
  const clock = options.clock ?? (() => new Date());
  const idempotency = new IdempotencyService(new IdempotencyRepository(options.database), clock);

  app.setErrorHandler((error, request, reply) => {
    const normalized = error instanceof AttemptApiError
      ? error
      : new AttemptApiError(500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。", true);
    const requestId = requestIdFor(request);
    const body: ApiError = {
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        ...(normalized.fieldErrors ? { fieldErrors: normalized.fieldErrors } : {}),
      },
      meta: { requestId, serverTime: clock().toISOString() },
    };
    return reply.code(normalized.statusCode).send(body);
  });

  app.patch("/v1/attempts/:id/transcript", async (request, reply) => {
    const ownerId = requireOwner(request);
    const { id } = parse(paramsSchema, request.params);
    const body: UpdateTranscriptRequest = parse(transcriptSchema, request.body);
    const transcript = options.pipeline.reviewTranscript({
      ownerId,
      attemptId: id,
      baseRevision: body.baseRevision,
      segments: body.segments,
    });
    return reply.code(200).send(success(transcript, request, clock));
  });

  app.post("/v1/attempts/:id/text", async (request, reply) => {
    const ownerId = requireOwner(request);
    const { id } = parse(paramsSchema, request.params);
    const body: SubmitTextAnswerRequest = parse(textAnswerSchema, request.body);
    const transcript = options.pipeline.submitTextAnswer(ownerId, id, body.text);
    return reply.code(201).send(success(transcript, request, clock));
  });

  app.post("/v1/attempts/:id/evaluation", async (request, reply) => {
    const ownerId = requireOwner(request);
    const key = requireIdempotencyKey(request);
    const { id } = parse(paramsSchema, request.params);
    const body: RequestEvaluationRequest = parse(evaluationSchema, request.body);
    const route = "/v1/attempts/:id/evaluation";
    const fingerprint = requestFingerprint({ attemptId: id, ...body });
    const replay = idempotency.find({ ownerId, method: "POST", route, key, fingerprint });
    if (replay) return reply.code(replay.responseStatus).send(JSON.parse(replay.responseBody) as unknown);

    const attempt = options.pipeline.beginEvaluation(ownerId, id, body);
    const response = success(attempt, request, clock);
    idempotency.save({
      ownerId,
      method: "POST",
      route,
      key,
      fingerprint,
      responseStatus: 202,
      responseBody: JSON.stringify(response),
    });
    options.pipeline.enqueueEvaluation(ownerId, id);
    return reply.code(202).send(response);
  });
};

function requireOwner(request: FastifyRequest): string {
  const owner = singleHeader(request.headers["x-demo-user-id"]);
  if (!owner) throw new AttemptApiError(401, "UNAUTHENTICATED", "缺少 x-demo-user-id 请求头。", false);
  return owner;
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const key = singleHeader(request.headers["idempotency-key"]);
  if (!key || key.length < 8 || key.length > 128) {
    throw new AttemptApiError(400, "INVALID_REQUEST", "Idempotency-Key 必须为 8 至 128 个字符。", false);
  }
  return key;
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && value.length === 1) return value[0]?.trim() || null;
  return null;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) fieldErrors[issue.path.join(".") || "request"] = issue.message;
  throw new AttemptApiError(400, "INVALID_REQUEST", "请求格式不正确。", false, fieldErrors);
}

function success<T>(data: T, request: FastifyRequest, clock: () => Date): ApiSuccess<T> {
  return { data, meta: { requestId: requestIdFor(request), serverTime: clock().toISOString() } };
}

function requestIdFor(request: FastifyRequest): string {
  return singleHeader(request.headers["x-request-id"]) ?? request.id ?? randomUUID();
}
