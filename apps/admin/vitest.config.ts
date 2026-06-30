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
        // + wrapper do ApiClient): linhas 7.4% → 14.1%. Story 38 cobriu catálogo
        // (Catalog/ProductDetail/CatalogQuality/MarketplaceCategories): 14.1% → 26.4%.
        // Story 39 fecha o admin (merchants/stores/usuários/dashboard + páginas de
        // operação/financeiro/ERP e telas merchant): 26.4% → 92.5% linhas. Atinge o
        // alvo de 80%. Piso de linhas cravado em 80 (story 44 — piso global), demais
        // eixos com folga p/ variação de CI.
        // perFile NÃO ligado: páginas/rotas/providers ficam abaixo do piso por
        // arquivo apesar do agregado alto; ligá-lo deixaria a main vermelha. Rigor
        // por arquivo p/ código novo via diff ≥ 90% (story 19).
        thresholds: {
          statements: 88,
          branches: 74,
          functions: 84,
          lines: 80,
        },
      },
    },
  }),
);
