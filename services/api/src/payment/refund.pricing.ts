/** Cálculo puro da falta cobrável por item para o reembolso (SF.3). Testável sem DB. */
import { computeItemTotal } from "../shared/pricing";

export type RefundReasonValue = "weight_shortfall" | "refused";

export interface RefundCalcItem {
  saleType: "unit" | "weight";
  unitPriceCents: number;
  quantity: number;
  weightGrams?: number | null;
  status: "pending" | "picked" | "refused" | "substituted";
  quantityPicked?: number | null;
  weightGramsPicked?: number | null;
  /** Valor original cobrado na linha (snapshot do pedido). */
  lineTotalCents: number;
}

export interface ItemShortfall {
  amountCents: number;
  reason: RefundReasonValue;
}

/**
 * Falta cobrável de um item (>0 entra no reembolso):
 * - `refused`: valor integral da linha (zera a cobrança).
 * - `picked` com separação menor que o pedido (peso ou unidade): diferença entre o
 *   valor pedido e o `min(separado, pedido)`. Over-delivery (separou mais) → sem falta.
 * - `pending`/`substituted`: sem falta (substituição é aprovada à parte, S3.4).
 */
export function itemShortfall(it: RefundCalcItem): ItemShortfall | null {
  if (it.status === "refused") {
    return it.lineTotalCents > 0 ? { amountCents: it.lineTotalCents, reason: "refused" } : null;
  }
  if (it.status === "picked") {
    const original = computeItemTotal({
      saleType: it.saleType,
      unitPriceCents: it.unitPriceCents,
      quantity: it.quantity,
      weightGrams: it.weightGrams,
    });
    const adjusted = computeItemTotal({
      saleType: it.saleType,
      unitPriceCents: it.unitPriceCents,
      quantity: Math.min(it.quantityPicked ?? it.quantity, it.quantity),
      weightGrams: Math.min(it.weightGramsPicked ?? it.weightGrams ?? 0, it.weightGrams ?? 0),
    });
    const diff = original - adjusted;
    return diff > 0 ? { amountCents: diff, reason: "weight_shortfall" } : null;
  }
  return null;
}
