/**
 * Roda em cada worker ANTES de qualquer import da app (jest `setupFiles`).
 * Aponta o backend para o banco/serviços de TESTE — nunca o de dev.
 * `.env` é carregado depois pelo ConfigModule, mas dotenv não sobrescreve
 * variáveis já presentes em process.env, então estes valores vencem.
 */
process.env.NODE_ENV = "test";

// Banco de teste SEPARADO (override do .env de dev). CI pode trocar via TEST_DATABASE_URL.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://markethub:markethub@localhost:5433/markethub_test?schema=public";

process.env.REDIS_URL ??= "redis://localhost:6380";
process.env.JWT_ACCESS_SECRET ??= "test_access_secret_change_me_xx";
process.env.JWT_REFRESH_SECRET ??= "test_refresh_secret_change_me_xx";

// Tudo em mock — e2e não fala com gateways externos nem agenda cron.
process.env.PAYMENT_PROVIDER = "mock";
process.env.PUSH_PROVIDER = "mock";
process.env.GEOCODING_PROVIDER = "mock";
process.env.ROUTING_PROVIDER = "mock";
process.env.COSMOS_TOKEN = "";
process.env.SYNC_SCHEDULE_ENABLED = "false";
process.env.MATCHING_SCHEDULE_ENABLED = "false";
process.env.LOG_LEVEL = "silent";
