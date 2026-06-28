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
      // Piso do ratchet — só sobe. Baseline real medido sob all:true (linhas 15.7%);
      // o "100%" anterior era escopo falso (só o barrel). Sem branches/functions
      // exercitados no baseline → piso 0 nesses eixos.
      thresholds: {
        statements: 15,
        branches: 0,
        functions: 0,
        lines: 15,
      },
    },
  },
});
