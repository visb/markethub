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
      // Piso do ratchet — só sobe. Story 35 cobriu client/socket/token-store: agregado
      // medido em 100/100/100/100 (st/br/fn/ln). Piso elevado pro real, com folga mínima
      // contra wobble do v8 — bem acima da meta de 80% linhas da rodada.
      thresholds: {
        statements: 98,
        branches: 95,
        functions: 98,
        lines: 98,
      },
    },
  },
});
