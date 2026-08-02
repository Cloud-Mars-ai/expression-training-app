import { createApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const host = process.env.HOST ?? "127.0.0.1";
const app = await createApp({
  logger: true,
  ...(process.env.DATABASE_PATH ? { databasePath: process.env.DATABASE_PATH } : {}),
  ...(process.env.UPLOADS_PATH ? { uploadsPath: process.env.UPLOADS_PATH } : {}),
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
