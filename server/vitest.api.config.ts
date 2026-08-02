import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/modules/attempts/**/*.api.test.ts",
      "src/modules/uploads/**/*.api.test.ts"
    ],
    sequence: {
      concurrent: false
    },
    clearMocks: true,
    restoreMocks: true,
  },
});
