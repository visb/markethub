import { z } from "zod";

/**
 * Cupons — gestão pelo admin (globais) e pelo merchant (da rede) — story 53.
 * O model `Coupon` é do backend (marketplace); estes são os contratos de API
 * consumidos pelos apps admin/merchant. Backend NÃO importa este pacote — manter
 * os dois lados em sincronia (CLAUDE.md).
 */
export const couponTypeSchema = z.enum(["fixed", "percent", "free_shipping"]);
export type CouponType = z.infer<typeof couponTypeSchema>;

/** Cupom (saída). `merchantId` null = global; `merchantName` acompanha p/ exibir. */
export const couponSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: couponTypeSchema,
  /** fixed: centavos; percent: %; free_shipping: ignorado. */
  value: z.number(),
  merchantId: z.string().nullable(),
  merchantName: z.string().nullable(),
  minOrderCents: z.number().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  maxUses: z.number().nullable(),
  usedCount: z.number(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type CouponDTO = z.infer<typeof couponSchema>;

/**
 * Payload de criação (merchant): a `merchantId` é resolvida pelo backend a partir
 * do contexto quando omitida (usada só p/ desambiguar múltiplas redes).
 */
export const createCouponInputSchema = z.object({
  code: z.string().min(1),
  type: couponTypeSchema,
  value: z.number().int(),
  minOrderCents: z.number().int().min(0).nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
  merchantId: z.string().optional(),
});
export type CreateCouponInput = z.infer<typeof createCouponInputSchema>;

/**
 * Payload de criação (admin): `merchantId` null/ausente = cupom global; id =
 * cupom atrelado a uma rede.
 */
export const adminCreateCouponInputSchema = createCouponInputSchema.extend({
  merchantId: z.string().nullable().optional(),
});
export type AdminCreateCouponInput = z.infer<typeof adminCreateCouponInputSchema>;

/** Patch de cupom: código é imutável (fora do payload); demais campos editáveis. */
export type UpdateCouponInput = Partial<{
  type: CouponType;
  value: number;
  minOrderCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  maxUses: number | null;
  active: boolean;
}>;
