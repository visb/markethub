import type {
  ApiClient,
  ApiKeyCreatedDTO,
  ApiKeyDTO,
  CreateWebhookInput,
  ErpConfigDTO,
  ErpConfigInput,
  UpdateWebhookInput,
  WebhookCreatedDTO,
  WebhookDTO,
} from "@markethub/api-client";

/**
 * Módulo de API tipado da integração (story 09). Toda chamada HTTP recebe o
 * ApiClient e é tipada aqui — nunca `request`/`fetch` cru em tela/hook (CLAUDE.md).
 * Owner-only: o backend reforça; o front esconde via `can("integration.manage")`.
 */

// ── ERP ──
export function getErpConfig(api: ApiClient): Promise<ErpConfigDTO> {
  return api.merchantErpConfig();
}
export function putErpConfig(api: ApiClient, input: ErpConfigInput): Promise<ErpConfigDTO> {
  return api.merchantPutErpConfig(input);
}

// ── Api-keys ──
export function listApiKeys(api: ApiClient): Promise<ApiKeyDTO[]> {
  return api.merchantApiKeys();
}
export function createApiKey(api: ApiClient, name: string): Promise<ApiKeyCreatedDTO> {
  return api.merchantCreateApiKey(name);
}
export function revokeApiKey(api: ApiClient, id: string) {
  return api.merchantRevokeApiKey(id);
}

// ── Webhooks ──
export function listWebhooks(api: ApiClient): Promise<WebhookDTO[]> {
  return api.merchantWebhooks();
}
export function createWebhook(api: ApiClient, input: CreateWebhookInput): Promise<WebhookCreatedDTO> {
  return api.merchantCreateWebhook(input);
}
export function updateWebhook(api: ApiClient, id: string, patch: UpdateWebhookInput): Promise<WebhookDTO> {
  return api.merchantUpdateWebhook(id, patch);
}
export function deleteWebhook(api: ApiClient, id: string) {
  return api.merchantDeleteWebhook(id);
}
export function testWebhook(api: ApiClient, id: string) {
  return api.merchantTestWebhook(id);
}
