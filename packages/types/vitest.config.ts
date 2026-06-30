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
      // Piso do ratchet — só sobe. Story 44 sela o piso global de 80% linhas.
      // Medido 29/06/2026 sob all-files: linhas/statements 85.36% (35/41),
      // branches e functions 0/0 (contratos triviais sem ramos nem funções →
      // v8 reporta 100%). Piso cravado em 80 nos quatro eixos, com folga ~5pt
      // sobre o medido em linhas/statements; branches/functions ficam em 80 como
      // valor seguro (0/0 satisfaz trivialmente — qualquer ramo/função novo sem
      // teste reprova, comportamento desejado do gate).
      // perFile NÃO ligado: 85.36% agregado vem de poucas linhas não cobertas
      // concentradas em 1+ arquivo que ficaria < 80 por arquivo. O rigor por
      // arquivo p/ código novo fica no gate de diff ≥ 90% (story 19).
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
