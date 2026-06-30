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
      // Piso do ratchet — só sobe. Story 36 cobriu os componentes RN
      // (Button/Text/Screen) via react-test-renderer. Story 44 confirma o piso
      // global de 80% linhas; medido 29/06/2026 sob all-files: 100% nos quatro
      // eixos (st/br/fn/ln).
      // perFile LIGADO: com 100% agregado todo arquivo incluído está em 100%, então
      // a superfície (pequena e estável) passa o piso por arquivo hoje — qualquer
      // componente novo abaixo de 80% reprova já no config, somando-se ao diff ≥ 90%.
      thresholds: {
        perFile: true,
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
