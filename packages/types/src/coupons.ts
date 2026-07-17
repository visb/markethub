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
  /** Título legível (story 73); null em cupons legados — exibir `title ?? code`. */
  title: z.string().nullable(),
  /** Descrição curta opcional (story 73). */
  description: z.string().nullable(),
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
  /** Título obrigatório na criação (story 73). */
  title: z.string().min(1),
  description: z.string().nullable().optional(),
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

/**
 * Cupom disponível no carrinho (story 74) — contrato do `GET /cart/coupons`
 * consumido pelo app cliente. Inclui aplicáveis e "quase-lá" (falham só pelo
 * pedido mínimo). Backend NÃO importa este pacote — manter em sincronia com
 * `AvailableCoupon` do `cart.service.ts`.
 */
export const availableCouponReasonSchema = z.object({
  code: z.literal("MIN_ORDER_NOT_MET"),
  /** Quanto falta (centavos) para atingir o pedido mínimo do cupom. */
  missingCents: z.number(),
});
export type AvailableCouponReason = z.infer<typeof availableCouponReasonSchema>;

export const availableCouponSchema = z.object({
  code: z.string(),
  /** `title ?? code` no card (story 73). */
  title: z.string().nullable(),
  description: z.string().nullable(),
  type: couponTypeSchema,
  value: z.number(),
  merchantId: z.string().nullable(),
  minOrderCents: z.number().nullable(),
  /** Desconto que aplicaria no carrinho atual (ignora o piso — valor exibido). */
  discountCents: z.number(),
  applicable: z.boolean(),
  /** Motivo quando não aplicável; `null` quando aplicável. */
  reason: availableCouponReasonSchema.nullable(),
});
export type AvailableCoupon = z.infer<typeof availableCouponSchema>;

/** Patch de cupom: código é imutável (fora do payload); demais campos editáveis. */
export type UpdateCouponInput = Partial<{
  title: string;
  description: string | null;
  type: CouponType;
  value: number;
  minOrderCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  maxUses: number | null;
  active: boolean;
}>;
