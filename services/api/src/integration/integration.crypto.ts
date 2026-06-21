import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Funções puras de cripto da integração (story 09). Sem estado, fáceis de testar
 * com vetor conhecido. Segredos JAMAIS são logados nem devolvidos em claro depois
 * de gerados.
 */

/** Prefixo da api-key de entrada (identifica chave de produção do MarketHub). */
export const API_KEY_PREFIX = "mk_live_";
/** Tamanho do prefixo guardado na listagem (inclui o `mk_live_`). */
export const API_KEY_PREFIX_LEN = API_KEY_PREFIX.length + 6;

/** Gera uma api-key de entrada com RNG seguro. Formato: `mk_live_<48 hex>`. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("hex");
}

/** Hash determinístico (SHA-256) para persistir a api-key — nunca o valor em claro. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Compara hash de uma chave candidata com o armazenado, em tempo constante. */
export function apiKeyMatches(candidate: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(candidate), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Prefixo guardado p/ identificar a chave na lista (nunca expõe o segredo). */
export function apiKeyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX_LEN);
}

/** Gera o secret de assinatura do webhook (RNG seguro). */
export function generateWebhookSecret(): string {
  return "whsec_" + randomBytes(24).toString("hex");
}

/**
 * Assinatura HMAC-SHA256 do corpo do webhook. O header `X-MarketHub-Signature`
 * carrega `sha256=<hex>`; o destino recalcula com o mesmo secret para validar.
 */
export function signWebhookBody(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/** Mascara um segredo p/ leitura: mostra só os últimos 4 chars. */
export function maskSecret(secret: string): string {
  if (secret.length <= 4) return "****";
  return "****" + secret.slice(-4);
}
