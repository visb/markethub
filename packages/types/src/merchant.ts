import { z } from "zod";

/** Papel efetivo do usuário dentro do app merchant. */
export const merchantRoleSchema = z.enum(["owner", "manager"]);
export type MerchantRole = z.infer<typeof merchantRoleSchema>;

export const merchantStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  merchantId: z.string(),
});
export type MerchantStoreDTO = z.infer<typeof merchantStoreSchema>;

/**
 * Contexto de identidade do app merchant (story 07). Resolve o papel efetivo
 * (dono da rede vs. gerente de loja) e as lojas que o usuário enxerga.
 * - owner (RoleName `merchant`): vê todas as lojas das redes que possui.
 * - manager (StoreStaff `manager` ativo): vê só as lojas dos vínculos dele.
 */
export const merchantContextSchema = z.object({
  role: merchantRoleSchema,
  /** merchant (rede) "principal" do usuário; null se owner sem rede ainda. */
  merchantId: z.string().nullable(),
  stores: z.array(merchantStoreSchema),
});
export type MerchantContextDTO = z.infer<typeof merchantContextSchema>;

/**
 * Loja completa devolvida pelo CRUD do app merchant (story 08). Inclui endereço,
 * coordenadas (geocodificadas), tempo de preparo, externalId (ERP) e active.
 */
export const merchantStoreDetailSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  name: z.string(),
  externalId: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  avgPrepMinutes: z.number(),
  active: z.boolean(),
});
export type MerchantStoreDetailDTO = z.infer<typeof merchantStoreDetailSchema>;

/** Payload para criar/editar uma loja (campos de endereço opcionais). */
export const merchantStoreInputSchema = z.object({
  name: z.string().min(1),
  merchantId: z.string().optional(),
  externalId: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  avgPrepMinutes: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
export type MerchantStoreInput = z.infer<typeof merchantStoreInputSchema>;
export type MerchantStoreUpdateInput = Partial<MerchantStoreInput>;

// ── Integração (story 09) ──

/** Eventos de pedido cobertos pelos webhooks no MVP. */
export const webhookEventSchema = z.enum(["order.created", "order.status_changed"]);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

/** Config de ERP (saída) — segredos vêm MASCARADOS na leitura. */
export const erpConfigSchema = z.object({
  connectorType: z.string().nullable(),
  connectorConfig: z.record(z.unknown()),
  availableTypes: z.array(z.string()),
});
export type ErpConfigDTO = z.infer<typeof erpConfigSchema>;

export const erpConfigInputSchema = z.object({
  connectorType: z.string().min(1),
  connectorConfig: z.record(z.unknown()),
});
export type ErpConfigInput = z.infer<typeof erpConfigInputSchema>;

/** Api-key de entrada — metadados; o valor em claro só aparece na criação. */
export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiKeyDTO = z.infer<typeof apiKeySchema>;

/** Resposta da criação de api-key: inclui a chave em claro UMA única vez. */
export const apiKeyCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  createdAt: z.string(),
  key: z.string(),
});
export type ApiKeyCreatedDTO = z.infer<typeof apiKeyCreatedSchema>;

/** Webhook — secret sempre mascarado na leitura (`secretMasked`). */
export const webhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  secretMasked: z.string(),
  lastDeliveryStatus: z.string().nullable(),
  lastDeliveryAt: z.string().nullable(),
  createdAt: z.string(),
});
export type WebhookDTO = z.infer<typeof webhookSchema>;

/** Resposta da criação de webhook: inclui o secret em claro UMA única vez. */
export type WebhookCreatedDTO = WebhookDTO & { secret: string };

export const createWebhookInputSchema = z.object({
  url: z.string().min(1),
  events: z.array(z.string()).optional(),
});
export type CreateWebhookInput = z.infer<typeof createWebhookInputSchema>;
export type UpdateWebhookInput = Partial<{
  url: string;
  events: string[];
  active: boolean;
}>;
