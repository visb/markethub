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
        // Piso do ratchet — só sobe. Baseline medido em 28/06/2026 (linhas 92.5%).
        thresholds: {
          statements: 90,
          branches: 78,
          functions: 84,
          lines: 90,
        },
      },
    },
  }),
);
