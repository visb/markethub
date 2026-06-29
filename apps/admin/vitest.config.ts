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
        // Piso do ratchet — só sobe. Baseline real medido sob all:true (linhas 6.3%).
        thresholds: {
          statements: 6,
          branches: 5,
          functions: 3,
          lines: 6,
        },
      },
    },
  }),
);
