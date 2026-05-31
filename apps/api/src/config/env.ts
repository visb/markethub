import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default("api/v1"),
  CORS_ORIGINS: z.string().default("*"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6380"),
  // Sync ERP agendado (preço/estoque). Cron + on/off.
  SYNC_SCHEDULE_ENABLED: z.coerce.boolean().default(false),
  SYNC_CRON: z.string().default("*/30 * * * *"),

  // Enriquecimento (S1.5). Sem token => usa MockEnrichmentProvider.
  COSMOS_TOKEN: z.string().optional(),
  COSMOS_BASE_URL: z.string().default("https://api.cosmos.bluesoft.com.br"),

  // Pagamento (S2.6). mock = sem gateway (dev/test).
  PAYMENT_PROVIDER: z.enum(["mock", "pagarme"]).default("mock"),
  PAGARME_SECRET_KEY: z.string().optional(),
  PAGARME_BASE_URL: z.string().default("https://api.pagar.me/core/v5"),
  PAGARME_WEBHOOK_SECRET: z.string().optional(),
  PIX_EXPIRES_SECONDS: z.coerce.number().int().positive().default(1800),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
});

export type Env = z.infer<typeof envSchema>;

/** Validador usado pelo ConfigModule (@nestjs/config). Falha cedo se env inválida. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
