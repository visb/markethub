import type { PickItemDTO } from "@markethub/api-client";
import {
  isDuplicateScan,
  matchScan,
  normalizeGtin,
  SCAN_DEBOUNCE_MS,
} from "@/lib/scanMatcher";

/**
 * Story 63: matcher puro do bip contra os itens da tarefa. Isolado da câmera/UI.
 * Cobre: unit confirma, weight foca input, já resolvido avisa, desconhecido erro,
 * peso variável (prefixo 2) tratado como desconhecido, e o debounce.
 */

function mkItem(over: Partial<PickItemDTO> = {}): PickItemDTO {
  return {
    id: "i1",
    orderItemId: "oi1",
    nameSnapshot: "Arroz 5kg",
    gtin: "7891234567890",
    saleType: "unit",
    status: "pending",
    quantity: 2,
    ...over,
  } as PickItemDTO;
}

describe("normalizeGtin", () => {
  it("mantém só dígitos", () => {
    expect(normalizeGtin(" 789-123 456.7890 ")).toBe("7891234567890");
  });
  it("null/undefined viram string vazia", () => {
    expect(normalizeGtin(undefined)).toBe("");
    expect(normalizeGtin(null)).toBe("");
  });
});

describe("matchScan", () => {
  it("item pendente unit → pick-unit", () => {
    const items = [mkItem()];
    const r = matchScan(items, "7891234567890");
    expect(r).toEqual({ kind: "pick-unit", item: items[0] });
  });

  it("normaliza o código lido antes de casar (aceita separadores)", () => {
    const items = [mkItem()];
    expect(matchScan(items, "789 1234 567890").kind).toBe("pick-unit");
  });

  it("item pendente weight → focus-weight (peso não vem do código)", () => {
    const items = [mkItem({ saleType: "weight", weightGrams: 500, quantity: 1 })];
    const r = matchScan(items, "7891234567890");
    expect(r).toEqual({ kind: "focus-weight", item: items[0] });
  });

  it("item já resolvido (picked) → already-resolved", () => {
    const items = [mkItem({ status: "picked" })];
    const r = matchScan(items, "7891234567890");
    expect(r).toEqual({ kind: "already-resolved", item: items[0] });
  });

  it("resolvido de forma otimista (resolvedIds) → already-resolved", () => {
    const items = [mkItem()];
    const r = matchScan(items, "7891234567890", new Set(["i1"]));
    expect(r).toEqual({ kind: "already-resolved", item: items[0] });
  });

  it("GTIN fora da tarefa → unknown", () => {
    const items = [mkItem()];
    const r = matchScan(items, "0000000000000");
    expect(r).toEqual({ kind: "unknown", code: "0000000000000" });
  });

  it("código vazio/ilegível → unknown", () => {
    expect(matchScan([mkItem()], "").kind).toBe("unknown");
  });

  it("peso variável (prefixo 2, embute peso) não casa o GTIN base → unknown", () => {
    // O código de balança (prefixo 2) difere do GTIN cadastrado do produto.
    const items = [mkItem({ gtin: "7891234567890" })];
    expect(matchScan(items, "2001234500008").kind).toBe("unknown");
  });

  it("dois itens com o mesmo GTIN: o pendente tem prioridade sobre o resolvido", () => {
    const items = [
      mkItem({ id: "a", status: "picked" }),
      mkItem({ id: "b", status: "pending" }),
    ];
    const r = matchScan(items, "7891234567890");
    expect(r).toEqual({ kind: "pick-unit", item: items[1] });
  });

  it("item sem gtin nunca casa", () => {
    const items = [mkItem({ gtin: undefined })];
    expect(matchScan(items, "7891234567890").kind).toBe("unknown");
  });
});

describe("isDuplicateScan (debounce)", () => {
  it("mesmo código dentro da janela é ignorado", () => {
    const prev = { code: "7891234567890", at: 1000 };
    expect(isDuplicateScan(prev, "7891234567890", 1000 + SCAN_DEBOUNCE_MS - 1)).toBe(true);
  });
  it("mesmo código após a janela é aceito", () => {
    const prev = { code: "7891234567890", at: 1000 };
    expect(isDuplicateScan(prev, "7891234567890", 1000 + SCAN_DEBOUNCE_MS + 1)).toBe(false);
  });
  it("código diferente sempre é aceito", () => {
    const prev = { code: "7891234567890", at: 1000 };
    expect(isDuplicateScan(prev, "7890000000017", 1001)).toBe(false);
  });
  it("primeira leitura (sem código anterior) é aceita", () => {
    expect(isDuplicateScan({ code: null, at: 0 }, "7891234567890", 10)).toBe(false);
  });
});
