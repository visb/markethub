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

  // Eventos de domínio (story 45): relay do transactional outbox (poll BullMQ).
  OUTBOX_RELAY_ENABLED: z.coerce.boolean().default(true),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().positive().default(50),

  // Enriquecimento (S1.5). Sem token => usa MockEnrichmentProvider.
  COSMOS_TOKEN: z.string().optional(),
  COSMOS_BASE_URL: z.string().default("https://api.cosmos.bluesoft.com.br"),

  // Pagamento (S2.6). mock = sem gateway (dev/test).
  PAYMENT_PROVIDER: z.enum(["mock", "pagarme"]).default("mock"),
  PAGARME_SECRET_KEY: z.string().optional(),
  PAGARME_BASE_URL: z.string().default("https://api.pagar.me/core/v5"),
  PAGARME_WEBHOOK_SECRET: z.string().optional(),
  PIX_EXPIRES_SECONDS: z.coerce.number().int().positive().default(1800),

  // Avaliações (S5.2): janela p/ avaliar após a entrega (dias) e teto da gorjeta.
  REVIEW_WINDOW_DAYS: z.coerce.number().int().positive().default(30),
  TIP_MAX_CENTS: z.coerce.number().int().positive().default(20000),

  // Notificações push (S5.6). mock = log; fcm = Firebase Cloud Messaging.
  PUSH_PROVIDER: z.enum(["mock", "fcm"]).default("mock"),
  FCM_SERVER_KEY: z.string().optional(),

  // Geocodificação de endereço (S6.2). mock = determinístico em Curitiba (dev).
  GEOCODING_PROVIDER: z.enum(["mock", "nominatim"]).default("mock"),
  NOMINATIM_BASE_URL: z.string().default("https://nominatim.openstreetmap.org"),

  // Rotas/entrega (Fase 4). mock = haversine local (sem token Google).
  ROUTING_PROVIDER: z.enum(["mock", "google"]).default("mock"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  MATCHING_SCHEDULE_ENABLED: z.coerce.boolean().default(true),
  // Precificação do ganho do entregador (centavos).
  DELIVERY_BASE_CENTS: z.coerce.number().int().nonnegative().default(500),
  DELIVERY_PER_KM_CENTS: z.coerce.number().int().nonnegative().default(150),
  DELIVERY_PER_STOP_CENTS: z.coerce.number().int().nonnegative().default(100),
  // Janela de decisão da oferta de rota (S4.4).
  OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(30),

  // Storage de imagens (S3.10). Compatível com S3/MinIO via presigned PUT (SigV4).
  STORAGE_ENDPOINT: z.string().default("http://localhost:9002"),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_BUCKET: z.string().default("markethub"),
  STORAGE_ACCESS_KEY: z.string().default("markethub"),
  STORAGE_SECRET_KEY: z.string().default("markethub123"),
  STORAGE_PUBLIC_URL: z.string().optional(), // base pública (CDN/proxy); default endpoint/bucket

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
