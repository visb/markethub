import { itemShortfall, type RefundCalcItem } from "./refund.pricing";

const weightItem = (over: Partial<RefundCalcItem>): RefundCalcItem => ({
  saleType: "weight",
  unitPriceCents: 1000, // R$10,00 / kg
  quantity: 1,
  weightGrams: 1000, // pediu 1kg → R$10,00
  status: "picked",
  quantityPicked: null,
  weightGramsPicked: 1000,
  lineTotalCents: 1000,
  ...over,
});

const unitItem = (over: Partial<RefundCalcItem>): RefundCalcItem => ({
  saleType: "unit",
  unitPriceCents: 500,
  quantity: 2,
  weightGrams: null,
  status: "picked",
  quantityPicked: 2,
  weightGramsPicked: null,
  lineTotalCents: 1000,
  ...over,
});

describe("itemShortfall (SF.3)", () => {
  it("peso separado MENOR que o pedido → falta = diferença", () => {
    // pediu 1000g (R$10), separou 800g (R$8) → falta R$2
    const sf = itemShortfall(weightItem({ weightGramsPicked: 800 }));
    expect(sf).toEqual({ amountCents: 200, reason: "weight_shortfall" });
  });

  it("peso separado MAIOR que o pedido → sem falta (não cobra a mais)", () => {
    const sf = itemShortfall(weightItem({ weightGramsPicked: 1200 }));
    expect(sf).toBeNull();
  });

  it("peso exatamente igual ao pedido → sem falta", () => {
    expect(itemShortfall(weightItem({ weightGramsPicked: 1000 }))).toBeNull();
  });

  it("item recusado → falta integral da linha", () => {
    const sf = itemShortfall(weightItem({ status: "refused", weightGramsPicked: null }));
    expect(sf).toEqual({ amountCents: 1000, reason: "refused" });
  });

  it("unidade separada completa → sem falta", () => {
    expect(itemShortfall(unitItem({ quantityPicked: 2 }))).toBeNull();
  });

  it("pendente ou substituído → sem falta", () => {
    expect(itemShortfall(weightItem({ status: "pending" }))).toBeNull();
    expect(itemShortfall(weightItem({ status: "substituted" }))).toBeNull();
  });

  it("agrega faltas de vários itens/grupos (soma das diferenças)", () => {
    const items = [
      weightItem({ weightGramsPicked: 800 }), // falta 200
      weightItem({ weightGramsPicked: 1200 }), // 0 (over)
      weightItem({ status: "refused", weightGramsPicked: null }), // 1000
      unitItem({ quantityPicked: 2 }), // 0
    ];
    const total = items
      .map(itemShortfall)
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .reduce((acc, s) => acc + s.amountCents, 0);
    expect(total).toBe(1200);
  });
});
