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
      // medido em 100/100/100/100 (st/br/fn/ln), reconfirmado 29/06/2026 (story 44).
      // Piso mantido acima do piso global de 80% (não baixa — ratchet), com folga
      // mínima contra wobble do v8.
      // perFile LIGADO: com 100% agregado todo arquivo está em 100%, então cada
      // arquivo passa o piso por arquivo hoje — código novo abaixo do piso reprova
      // já no config, complementando o diff ≥ 90%.
      thresholds: {
        perFile: true,
        statements: 98,
        branches: 95,
        functions: 98,
        lines: 98,
      },
    },
  },
});
