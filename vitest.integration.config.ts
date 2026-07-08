import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts", "**/*.msw.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    setupFiles: ["./src/test/msw/setupIntegration.ts"],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@galaxy/schemas": path.resolve(__dirname, "./src/schemas/index.ts"),
    },
  },
});
