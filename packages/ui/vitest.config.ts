import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const mock = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const rnMock = mock("./src/test/react-native.mock.tsx");
const safeAreaMock = mock("./src/test/safe-area-context.mock.tsx");
const mapsMock = mock("./src/test/react-native-maps.mock.tsx");
const reactLeafletMock = mock("./src/test/react-leaflet.mock.tsx");
const leafletMock = mock("./src/test/leaflet.mock.ts");
const leafletCssMock = mock("./src/test/leaflet-css.mock.ts");

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // RN e os engines de mapa não importam fora do Metro/jest-expo: aliasamos para
    // mocks leves e renderizamos com react-test-renderer (ver src/test/). Aliases
    // exatos (regex) p/ "leaflet" não capturar "leaflet/dist/leaflet.css".
    alias: [
      { find: /^react-native-safe-area-context$/, replacement: safeAreaMock },
      { find: /^react-native$/, replacement: rnMock },
      { find: /^react-native-maps$/, replacement: mapsMock },
      { find: /^react-leaflet$/, replacement: reactLeafletMock },
      { find: /^leaflet\/dist\/leaflet\.css$/, replacement: leafletCssMock },
      { find: /^leaflet$/, replacement: leafletMock },
    ],
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
