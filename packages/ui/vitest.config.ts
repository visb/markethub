import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/index.ts"],
      reporter: ["text-summary", "lcov", "json-summary"],
      // Piso do ratchet — só sobe. Baseline real medido sob all:true (linhas 28.6%);
      // o "100%" anterior era escopo falso (só o barrel). Componentes RN ainda sem
      // teste → branches/functions em 0 no baseline.
      thresholds: {
        statements: 28,
        branches: 0,
        functions: 0,
        lines: 28,
      },
    },
  },
});
