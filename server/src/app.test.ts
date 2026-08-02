import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("production origin configuration", () => {
  it("allows the configured public origin for same-site API requests", async () => {
    const root = join(process.cwd(), "var", "test", `app-${randomUUID()}`);
    const app = await createApp({
      databasePath: join(root, "app.sqlite"),
      uploadsPath: join(root, "uploads"),
      allowedOrigins: ["https://ai-rag.online"],
    });
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/v1/attempts",
        headers: {
          origin: "https://ai-rag.online",
          "access-control-request-method": "POST",
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("https://ai-rag.online");
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
