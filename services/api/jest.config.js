/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  coverageDirectory: "<rootDir>/../coverage",
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  // Gate de cobertura (story 19) — all-files cravado no config, não em flag CLI.
  // Glob relativo ao rootDir ("src"). Exclui specs, wiring de framework e código
  // sem lógica testável (modules, DTOs, bootstrap, processors, schedulers).
  collectCoverageFrom: [
    "**/*.ts",
    "!**/*.spec.ts",
    "!**/*.module.ts",
    "!**/*.dto.ts",
    "!main.ts",
    "!**/*.processor.ts",
    "!**/*.scheduler.ts",
  ],
  coverageReporters: ["text-summary", "lcov", "json-summary"],
  // Piso do ratchet — só sobe. Story 43 levou o agregado ao meta-alvo (medido
  // 29/06/2026: lines 83.07% / branches 75.9% / functions 81.12% / statements 82.45%).
  // Story 44 sela o piso global de 80% linhas; este já está em 80 (linhas).
  // Pisos cravados abaixo do medido com folga p/ não flapar no CI.
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 75,
      lines: 80,
    },
  },
  // perFile NÃO ligado (nota da story 19): mesmo excluindo modules/dtos/main/
  // processors/schedulers, sobram ~19 arquivos em 0% — controllers cobertos só
  // por e2e (auth/checkout/payment/health/…) + bootstrap sem lógica testável
  // (env.ts, prisma.service.ts, jwt.strategy.ts, all-exceptions.filter.ts,
  // http-webhook-sender.ts). Um perFile global deixaria a main vermelha. O rigor
  // por arquivo p/ código novo fica no gate de diff ≥ 90% (story 19).
};
