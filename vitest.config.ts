import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts", "**/*.msw.integration.test.ts", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@galaxy/schemas": path.resolve(__dirname, "./src/schemas/index.ts"),
    },
  },
});
