import { randomUUID } from "node:crypto";
import type {
  ApiError,
  ApiErrorCode,
  ApiSuccess,
  CreateAttemptRequest,
  UpdateAttemptStatusRequest,
} from "@expression-training/contracts";
import multipart from "@fastify/multipart";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { openDatabase, type SqliteDatabase } from "../../db/database.js";
import { AttemptRepository, IdempotencyRepository } from "../../db/repositories.js";
import { LocalAudioStorage, type AudioStorage } from "../uploads/storage.js";
import { readAudioMultipart } from "../uploads/multipart.js";
import { UploadValidationError } from "../uploads/upload-validation.js";
import { AttemptApiError } from "./errors.js";
import { IdempotencyService, requestFingerprint } from "./idempotency.js";
import { AttemptService, type AttemptAggregateReaders } from "./service.js";

const idSchema = z.string().min(1).max(200);
const createAttemptSchema = z.object({
  exerciseId: idSchema,
  exerciseVersionId: idSchema,
  frameworkId: z.enum(["PREP", "STAR", "SCQA"]).optional(),
  inputMode: z.enum(["voice", "text"]).default("voice"),
  retryOfAttemptId: idSchema.optional(),
  focusIssueId: idSchema.optional(),
  locale: z.literal("zh-CN"),
  clientTimeZone: z.string().min(1).max(100),
});
const updateStatusSchema = z.object({
  expectedStatusVersion: z.number().int().positive(),
  status: z.enum(["permission-check", "text-entry", "recording", "cancelled"]),
  clientEventAt: z.iso.datetime(),
});
const paramsSchema = z.object({ id: idSchema });

export type AttemptsRoutesOptions = {
  database?: SqliteDatabase;
  storage?: AudioStorage;
  readers?: AttemptAggregateReaders;
  clock?: () => Date;
  createId?: () => string;
  onAudioUploaded?: (input: { attemptId: string; ownerId: string }) => Promise<void>;
};

export const attemptsRoutes: FastifyPluginAsync<AttemptsRoutesOptions> = async (app, options) => {
  const ownsDatabase = !options.database;
  const database = options.database ?? openDatabase();
  const storage = options.storage ?? new LocalAudioStorage();
  const clock = options.clock ?? (() => new Date());
  const attemptRepository = new AttemptRepository(database);
  const idempotency = new IdempotencyService(new IdempotencyRepository(database), clock);
  const service = new AttemptService(attemptRepository, storage, {
    ...(options.readers ? { readers: options.readers } : {}),
    clock,
    ...(options.createId ? { createId: options.createId } : {}),
  });

  if (!app.hasRequestDecorator("isMultipart")) {
    await app.register(multipart, {
      limits: { files: 1, fields: 1, parts: 2 },
    });
  }

  if (ownsDatabase) app.addHook("onClose", async () => database.close());

  app.setErrorHandler((error, request, reply) => {
    const requestId = getRequestId(request);
    reply.header("x-request-id", requestId);
    const normalized = normalizeError(error);
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

  app.post("/v1/attempts", async (request, reply) => {
    const ownerId = requireOwner(request);
    const key = requireIdempotencyKey(request);
    const parsed = parseWithSchema(createAttemptSchema, request.body);
    const body: CreateAttemptRequest = {
      exerciseId: parsed.exerciseId,
      exerciseVersionId: parsed.exerciseVersionId,
      ...(parsed.frameworkId ? { frameworkId: parsed.frameworkId } : {}),
      inputMode: parsed.inputMode,
      ...(parsed.retryOfAttemptId ? { retryOfAttemptId: parsed.retryOfAttemptId } : {}),
      ...(parsed.focusIssueId ? { focusIssueId: parsed.focusIssueId } : {}),
      locale: parsed.locale,
      clientTimeZone: parsed.clientTimeZone,
    };
    const fingerprint = requestFingerprint(body);
    const replay = idempotency.find({ ownerId, method: "POST", route: "/v1/attempts", key, fingerprint });
    if (replay) return sendStoredResponse(reply, replay.responseStatus, replay.responseBody);

    const attempt = attemptRepository.runInTransaction(() => service.createAttempt(ownerId, body));
    const response = successResponse(attempt, request, clock);
    const serialized = JSON.stringify(response);
    idempotency.save({
      ownerId,
      method: "POST",
      route: "/v1/attempts",
      key,
      fingerprint,
      responseStatus: 201,
      responseBody: serialized,
    });
    return reply.code(201).send(response);
  });

  app.patch("/v1/attempts/:id/status", async (request, reply) => {
    const ownerId = requireOwner(request);
    const { id } = parseWithSchema(paramsSchema, request.params);
    const parsed = parseWithSchema(updateStatusSchema, request.body);
    const body: UpdateAttemptStatusRequest = parsed;
    const attempt = service.updateStatus(ownerId, id, body);
    return reply.code(200).send(successResponse(attempt, request, clock));
  });

  app.post("/v1/attempts/:id/audio", async (request, reply) => {
    const ownerId = requireOwner(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseWithSchema(paramsSchema, request.params);
    const upload = await readAudioMultipart(request);
    const fingerprint = requestFingerprint({
      attemptId: id,
      mimeType: upload.mimeType,
      byteSize: upload.byteSize,
      durationMs: upload.durationMs,
      sha256: upload.sha256,
      clientRecordedAt: upload.clientRecordedAt,
    });
    const route = "/v1/attempts/:id/audio";
    const replay = idempotency.find({ ownerId, method: "POST", route, key, fingerprint });
    if (replay) return sendStoredResponse(reply, replay.responseStatus, replay.responseBody);

    const attempt = await service.uploadAudio(ownerId, id, upload);
    if (options.onAudioUploaded) {
      queueMicrotask(() => {
        void options.onAudioUploaded?.({ attemptId: id, ownerId }).catch(() => undefined);
      });
    }
    const response = successResponse(attempt, request, clock);
    const serialized = JSON.stringify(response);
    idempotency.save({
      ownerId,
      method: "POST",
      route,
      key,
      fingerprint,
      responseStatus: 202,
      responseBody: serialized,
    });
    return reply.code(202).send(response);
  });

  app.get("/v1/attempts/:id", async (request, reply) => {
    const ownerId = requireOwner(request);
    const { id } = parseWithSchema(paramsSchema, request.params);
    const detail = await service.getAttemptDetail(ownerId, id);
    return reply.code(200).send(successResponse(detail, request, clock));
  });

  app.delete("/v1/attempts/:id", async (request, reply) => {
    const ownerId = requireOwner(request);
    const { id } = parseWithSchema(paramsSchema, request.params);
    await service.deleteAttempt(ownerId, id);
    return reply.code(204).send();
  });
};

function requireOwner(request: FastifyRequest): string {
  const ownerId = singleHeader(request.headers["x-demo-user-id"]);
  if (!ownerId || ownerId.length > 200) {
    throw new AttemptApiError(401, "UNAUTHENTICATED", "缺少有效的 x-demo-user-id 请求头。", false, {
      "x-demo-user-id": "必须提供 1 至 200 个字符。",
    });
  }
  return ownerId;
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const key = singleHeader(request.headers["idempotency-key"]);
  if (!key || key.length < 8 || key.length > 128) {
    throw new AttemptApiError(400, "INVALID_REQUEST", "缺少有效的 Idempotency-Key 请求头。", false, {
      "idempotency-key": "必须提供 8 至 128 个字符。",
    });
  }
  return key;
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && value.length === 1) return value[0]?.trim() || null;
  return null;
}

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) fieldErrors[issue.path.join(".") || "request"] = issue.message;
  throw new AttemptApiError(400, "INVALID_REQUEST", "请求格式不正确。", false, fieldErrors);
}

function successResponse<T>(data: T, request: FastifyRequest, clock: () => Date): ApiSuccess<T> {
  return {
    data,
    meta: { requestId: getRequestId(request), serverTime: clock().toISOString() },
  };
}

function getRequestId(request: FastifyRequest): string {
  return singleHeader(request.headers["x-request-id"]) ?? request.id ?? randomUUID();
}

function sendStoredResponse(reply: FastifyReply, statusCode: number, body: string): FastifyReply {
  return reply.code(statusCode).send(JSON.parse(body) as unknown);
}

function normalizeError(error: unknown): {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
} {
  if (error instanceof AttemptApiError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    };
  }
  if (error instanceof UploadValidationError) {
    const statusCode = error.code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : error.code === "AUDIO_TOO_LARGE" ? 413 : 400;
    return {
      statusCode,
      code: error.code,
      message: error.message,
      retryable: false,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    };
  }
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "服务暂时不可用，请稍后重试。",
    retryable: true,
  };
}
