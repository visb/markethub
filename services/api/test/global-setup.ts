import { execSync } from "node:child_process";
import * as path from "node:path";

/**
 * Roda UMA vez antes da suíte e2e. Cria o banco de teste se não existir e
 * sincroniza o schema atual via `prisma db push` (sem histórico de migration —
 * o banco de teste é descartável). Nunca toca o banco de dev.
 */
export default async function globalSetup(): Promise<void> {
  const apiRoot = path.resolve(__dirname, "..");
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgresql://markethub:markethub@localhost:5433/markethub_test?schema=public";

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: apiRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
