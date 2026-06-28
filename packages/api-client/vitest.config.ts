import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text-summary", "lcov", "json-summary"],
      // Piso do ratchet — só sobe. Baseline medido em 28/06/2026 (linhas 38.3%).
      thresholds: {
        statements: 36,
        branches: 31,
        functions: 21,
        lines: 37,
      },
    },
  },
});
