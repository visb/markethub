import { BadRequestException } from "@nestjs/common";

/**
 * Regras de cupom compartilhadas entre os donos da gestão (story 53). Kernel
 * compartilhado: sem I/O (não toca o banco), importável por qualquer contexto
 * (merchant, admin) — evita duplicar a validação e o cross-context de internals.
 *
 * O model `Coupon` é do marketplace (aplicação no carrinho, fora de escopo); aqui
 * só validamos o payload de criação/edição: código, faixa de valor por tipo,
 * janela de validade e limite de usos coerente com o já consumido.
 */

export type CouponType = "fixed" | "percent" | "free_shipping";

export const COUPON_TYPES: readonly CouponType[] = ["fixed", "percent", "free_shipping"];

/** Valores efetivos de um cupom para validação (create = zerado; update = merge). */
export interface CouponRuleValues {
  type: CouponType;
  value: number;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  maxUses?: number | null;
}

// Código: 3–32 alfanuméricos (+ hífen/underscore), sem espaço. Case-insensitive
// na criação — normalizamos para caixa alta para comparar/garantir unicidade.
const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/** Normaliza o código do cupom: trim + caixa alta (comparação case-insensitive). */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Valida e normaliza o código; lança `COUPON_INVALID_CODE` se fora do formato. */
export function assertValidCouponCode(code: string): string {
  const normalized = normalizeCouponCode(code);
  if (!CODE_RE.test(normalized)) {
    throw new BadRequestException({
      code: "COUPON_INVALID_CODE",
      message: "Código inválido: use 3–32 letras, números, hífen ou underscore",
    });
  }
  return normalized;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v : new Date(v);
}

/** Estado de resgate de um cupom persistido (validade + limite de usos). */
export interface CouponRedeemState {
  active: boolean;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  maxUses?: number | null;
  usedCount?: number | null;
}

/**
 * Cupom resgatável AGORA? Regra única (story 74) reutilizada pela aplicação no
 * carrinho (`POST /cart/coupon`) e pela listagem de disponíveis (`GET /cart/coupons`):
 * ativo, dentro da janela de validade e ainda com usos disponíveis. Não avalia
 * escopo de merchant nem pedido mínimo — isso depende do carrinho.
 */
export function isCouponRedeemable(c: CouponRedeemState, now: Date = new Date()): boolean {
  if (!c.active) return false;
  const from = toDate(c.validFrom);
  const to = toDate(c.validTo);
  if (from && from > now) return false;
  if (to && to < now) return false;
  if (c.maxUses !== null && c.maxUses !== undefined && (c.usedCount ?? 0) >= c.maxUses) return false;
  return true;
}

/**
 * Valida os valores efetivos de um cupom (após merge do patch, se for edição).
 * `usedCount` é o total já consumido — o novo `maxUses` não pode ficar abaixo.
 */
export function assertValidCouponRules(values: CouponRuleValues, usedCount = 0): void {
  const { type, value } = values;

  if (type === "percent") {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestException({
        code: "COUPON_INVALID_PERCENT",
        message: "Percentual deve estar entre 1 e 100",
      });
    }
  } else if (type === "fixed") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException({
        code: "COUPON_INVALID_VALUE",
        message: "Valor fixo deve ser maior que zero (em centavos)",
      });
    }
  }
  // free_shipping ignora `value` (desconta a entrega).

  const from = toDate(values.validFrom);
  const to = toDate(values.validTo);
  if (from && to && from >= to) {
    throw new BadRequestException({
      code: "COUPON_INVALID_WINDOW",
      message: "Início da validade deve ser anterior ao fim",
    });
  }

  if (values.maxUses !== null && values.maxUses !== undefined) {
    if (!Number.isInteger(values.maxUses) || values.maxUses < 1) {
      throw new BadRequestException({
        code: "COUPON_INVALID_MAX_USES",
        message: "Limite de usos deve ser um inteiro positivo",
      });
    }
    if (values.maxUses < usedCount) {
      throw new BadRequestException({
        code: "COUPON_MAX_USES_BELOW_USED",
        message: "Limite de usos não pode ser menor que o total já utilizado",
      });
    }
  }
}
