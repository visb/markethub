import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rnMock = fileURLToPath(new URL("./src/test/react-native.mock.tsx", import.meta.url));
const safeAreaMock = fileURLToPath(
  new URL("./src/test/safe-area-context.mock.tsx", import.meta.url),
);

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // RN não importa fora do Metro/jest-expo: aliasamos para mocks leves e
    // renderizamos os componentes com react-test-renderer (ver src/test/).
    alias: {
      "react-native-safe-area-context": safeAreaMock,
      "react-native": rnMock,
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/index.ts", "src/test/**"],
      reporter: ["text-summary", "lcov", "json-summary"],
      // Piso do ratchet — só sobe. Story 36: componentes RN (Button/Text/Screen)
      // agora cobertos via react-test-renderer; baseline reaferido sob all-files.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
