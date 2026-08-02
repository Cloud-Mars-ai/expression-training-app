import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { openDatabase } from "./db/database.js";
import { AnalysisPipeline } from "./integration/analysis-pipeline.js";
import { analysisRoutes } from "./integration/analysis-routes.js";
import { attemptsRoutes } from "./modules/attempts/index.js";
import { LocalAudioStorage } from "./modules/uploads/index.js";
import { createRuntimeProviders, type EvaluationProvider, type TranscriptionProvider } from "./providers/index.js";

export type CreateAppOptions = {
  databasePath?: string;
  uploadsPath?: string;
  transcriptionProvider?: TranscriptionProvider;
  evaluationProvider?: EvaluationProvider;
  logger?: boolean;
  clock?: () => Date;
  allowedOrigins?: readonly string[];
};

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const database = openDatabase(options.databasePath);
  const storage = new LocalAudioStorage(options.uploadsPath);
  const runtimeProviders = createRuntimeProviders();
  const allowedOrigins = new Set(options.allowedOrigins ?? configuredOrigins());
  const pipeline = new AnalysisPipeline(
    database,
    storage,
    options.transcriptionProvider ?? runtimeProviders.transcription,
    options.evaluationProvider ?? runtimeProviders.evaluation,
    options.clock,
  );

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin)) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed."), false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-demo-user-id", "idempotency-key", "x-request-id"],
  });
  await app.register(attemptsRoutes, {
    database,
    storage,
    readers: pipeline.readers,
    ...(options.clock ? { clock: options.clock } : {}),
    onAudioUploaded: async ({ attemptId, ownerId }) => pipeline.enqueueTranscription(ownerId, attemptId),
  });
  await app.register(analysisRoutes, {
    database,
    pipeline,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.addHook("onClose", async () => {
    await pipeline.drain();
    database.close();
  });
  await app.ready();
  pipeline.resumePending();
  return app;
}

function configuredOrigins(): string[] {
  return (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/u, "");
}
