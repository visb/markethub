/**
 * Config jest dos testes e2e do backend (supertest + app real).
 * Separada da unit (jest.config.js): rootDir = test/, sufixo .e2e-spec.ts.
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: ".*\\.e2e-spec\\.ts$",
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  setupFiles: ["<rootDir>/setup-env.ts"],
  globalSetup: "<rootDir>/global-setup.ts",
  testTimeout: 30000,
};
