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
