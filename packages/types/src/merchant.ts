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
