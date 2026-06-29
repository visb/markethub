import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/vite-env.d.ts"],
        reporter: ["text-summary", "lcov", "json-summary"],
        // Piso do ratchet — só sobe. Story 37 cobriu a fundação (auth/shell/router
        // + wrapper do ApiClient): linhas 7.4% → 14.1%. Piso com folga p/ variação.
        thresholds: {
          statements: 13,
          branches: 9,
          functions: 8,
          lines: 13,
        },
      },
    },
  }),
);
