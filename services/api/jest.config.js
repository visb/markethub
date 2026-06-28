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
  // Piso do ratchet — só sobe. Baseline medido em 28/06/2026 (linhas 36.3%).
  coverageThreshold: {
    global: {
      statements: 35,
      branches: 30,
      functions: 29,
      lines: 35,
    },
  },
};
