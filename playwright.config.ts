import { defineConfig, devices } from "@playwright/test";

/**
 * E2E web (Playwright) — admin (Vite) + apps mobile em Expo web.
 *
 * Cada app vira um "project" com seu próprio webServer. Para rodar um
 * subconjunto (e não subir todos os dev servers), use E2E_APPS ou --project:
 *   E2E_APPS=admin pnpm test:e2e
 *   pnpm test:e2e --project=admin --project=customer
 */
const ALL_APPS = [
  { name: "admin", port: 3001, command: "pnpm --filter @markethub/admin dev" },
  { name: "customer", port: 8081, command: "pnpm --filter @markethub/customer web" },
  { name: "picker", port: 8082, command: "pnpm --filter @markethub/picker web" },
  { name: "driver", port: 8083, command: "pnpm --filter @markethub/driver web" },
] as const;

// --project também filtra os webServers (senão todo run subiria os 4 dev servers)
const argvProjects = process.argv.flatMap((arg, i, argv) => {
  if (arg.startsWith("--project=")) return [arg.slice("--project=".length)];
  if (arg === "--project" && argv[i + 1]) return [argv[i + 1]];
  return [];
});

const selected = (
  process.env.E2E_APPS?.split(",") ??
  (argvProjects.length > 0 ? argvProjects : ALL_APPS.map((a) => a.name))
)
  .map((s) => s.trim())
  .filter(Boolean);

const apps = ALL_APPS.filter((a) => selected.includes(a.name));

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    // primeiro page-load do Expo web dispara o bundle do Metro — lento
    navigationTimeout: 150_000,
  },
  projects: apps.map((app) => ({
    name: app.name,
    testDir: `./e2e/${app.name}`,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: `http://localhost:${app.port}`,
    },
  })),
  webServer: apps.map((app) => ({
    command: app.command,
    url: `http://localhost:${app.port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // CI=1 deixa o Expo CLI não-interativo
    env: { ...process.env, CI: "1" },
  })),
});
