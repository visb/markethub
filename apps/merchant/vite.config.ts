import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Consome os pacotes workspace direto do source TS (sem interop CJS/ESM do dist).
      "@markethub/api-client": path.resolve(__dirname, "../../packages/api-client/src/index.ts"),
      "@markethub/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
    },
  },
  server: { port: 3002 },
});
