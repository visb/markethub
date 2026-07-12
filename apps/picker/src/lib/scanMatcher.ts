import type { PickItemDTO } from "@markethub/api-client";

/**
 * Casamento puro do bip (código de barras lido) contra os itens da tarefa de
 * separação — isolado da UI/câmera p/ ser testável (story 63). O componente do
 * scanner só chama estas funções; toda a decisão vive aqui.
 */

export type ScanMatch =
  /** Item pendente vendido por unidade: confirma separado com a qty do pedido. */
  | { kind: "pick-unit"; item: PickItemDTO }
  /** Item pendente por peso: foca o input de gramas (peso vem da balança). */
  | { kind: "focus-weight"; item: PickItemDTO }
  /** GTIN corresponde a um item já resolvido (separado/recusado/substituído). */
  | { kind: "already-resolved"; item: PickItemDTO }
  /** GTIN não pertence a nenhum item da tarefa (ou vazio/ilegível). */
  | { kind: "unknown"; code: string };

/** Só dígitos — normaliza EAN/UPC (remove espaços, zeros de leitura, etc.). */
export function normalizeGtin(code: string | null | undefined): string {
  return (code ?? "").replace(/\D/g, "");
}

/**
 * Resolve o que fazer com um código lido. `resolvedIds` cobre itens já resolvidos
 * de forma otimista (bip anterior ainda não commitado) — evita re-disparar pick.
 */
export function matchScan(
  items: PickItemDTO[],
  rawCode: string,
  resolvedIds?: ReadonlySet<string>,
): ScanMatch {
  const code = normalizeGtin(rawCode);
  if (!code) return { kind: "unknown", code };

  const matches = items.filter((i) => normalizeGtin(i.gtin) === code);
  if (matches.length === 0) return { kind: "unknown", code };

  const isResolved = (i: PickItemDTO) => i.status !== "pending" || !!resolvedIds?.has(i.id);
  const pending = matches.find((i) => !isResolved(i));
  if (!pending) return { kind: "already-resolved", item: matches[0]! };

  return pending.saleType === "weight"
    ? { kind: "focus-weight", item: pending }
    : { kind: "pick-unit", item: pending };
}

/** Janela padrão (ms) do debounce entre duas leituras do mesmo código. */
export const SCAN_DEBOUNCE_MS = 1500;

export interface ScanGuard {
  code: string | null;
  at: number;
}

/**
 * `true` quando a leitura deve ser ignorada por ser o mesmo código dentro da
 * janela — a câmera dispara `onBarcodeScanned` várias vezes/segundo com o código
 * ainda enquadrado.
 */
export function isDuplicateScan(
  prev: ScanGuard,
  rawCode: string,
  now: number,
  windowMs: number = SCAN_DEBOUNCE_MS,
): boolean {
  return prev.code === normalizeGtin(rawCode) && now - prev.at < windowMs;
}
