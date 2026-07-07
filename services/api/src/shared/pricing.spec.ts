import { computeCart, computeItemTotal, type CalcGroup } from "./pricing";

describe("computeItemTotal", () => {
  it("unit: preço × quantidade", () => {
    expect(computeItemTotal({ saleType: "unit", unitPriceCents: 899, quantity: 3 })).toBe(2697);
  });
  it("weight: preço/kg × gramas/1000", () => {
    // R$59,90/kg × 300g = R$17,97
    expect(
      computeItemTotal({ saleType: "weight", unitPriceCents: 5990, quantity: 1, weightGrams: 300 }),
    ).toBe(1797);
  });
});

const groups: CalcGroup[] = [
  {
    merchantId: "m1",
    deliveryFeeCents: 700,
    prepFeeCents: 0,
    platformFeeBps: 1000, // 10%
    items: [{ saleType: "unit", unitPriceCents: 1000, quantity: 2 }], // 2000
  },
  {
    merchantId: "m2",
    deliveryFeeCents: 500,
    prepFeeCents: 100,
    platformFeeBps: 1000,
    items: [{ saleType: "weight", unitPriceCents: 5000, quantity: 1, weightGrams: 500 }], // 2500
  },
];

describe("computeCart", () => {
  it("soma itens, frete, preparo e taxa por loja", () => {
    const r = computeCart(groups);
    expect(r.itemsCents).toBe(4500);
    expect(r.deliveryCents).toBe(1200);
    expect(r.prepCents).toBe(100);
    expect(r.platformFeeCents).toBe(450); // 10% de 4500
    expect(r.totalCents).toBe(4500 + 1200 + 100 + 450);
  });

  it("door surcharge soma uma vez", () => {
    const r = computeCart(groups, { doorSurchargeCents: 400 });
    expect(r.doorSurchargeCents).toBe(400);
    expect(r.totalCents).toBe(6250 + 400);
  });

  it("cupom percentual desconta do subtotal", () => {
    const r = computeCart(groups, { coupon: { type: "percent", value: 10 } });
    expect(r.discountCents).toBe(450);
  });

  it("cupom frete grátis zera entrega", () => {
    const r = computeCart(groups, { coupon: { type: "free_shipping", value: 0 } });
    expect(r.discountCents).toBe(1200);
  });

  it("cupom de merchant só conta aquele grupo", () => {
    const r = computeCart(groups, {
      coupon: { type: "percent", value: 50, merchantId: "m1" },
    });
    expect(r.discountCents).toBe(1000); // 50% de 2000 (só m1)
  });

  it("cupom fixo limita ao subtotal escopado", () => {
    // fixo de 99999 não pode descontar mais que o subtotal (4500)
    const r = computeCart(groups, { coupon: { type: "fixed", value: 99999 } });
    expect(r.discountCents).toBe(4500);
  });

  it("cupom fixo abaixo do subtotal desconta o valor cheio", () => {
    const r = computeCart(groups, { coupon: { type: "fixed", value: 800 } });
    expect(r.discountCents).toBe(800);
  });

  it("minOrderCents não atingido → sem desconto", () => {
    const r = computeCart(groups, {
      coupon: { type: "percent", value: 10, minOrderCents: 9999 },
    });
    expect(r.discountCents).toBe(0);
  });

  it("minOrderCents atingido → aplica desconto", () => {
    const r = computeCart(groups, {
      coupon: { type: "percent", value: 10, minOrderCents: 4500 },
    });
    expect(r.discountCents).toBe(450);
  });

  it("total nunca fica negativo (desconto > total → 0)", () => {
    const single: CalcGroup[] = [
      {
        merchantId: "m1",
        deliveryFeeCents: 0,
        prepFeeCents: 0,
        platformFeeBps: 0,
        items: [{ saleType: "unit", unitPriceCents: 100, quantity: 1 }],
      },
    ];
    const r = computeCart(single, { coupon: { type: "fixed", value: 100 } });
    expect(r.totalCents).toBe(0);
  });

  it("weight com gramas negativo é tratado como 0", () => {
    expect(
      computeItemTotal({ saleType: "weight", unitPriceCents: 5000, quantity: 1, weightGrams: -300 }),
    ).toBe(0);
  });

  it("quantity negativa em unit é tratada como 0", () => {
    expect(computeItemTotal({ saleType: "unit", unitPriceCents: 100, quantity: -5 })).toBe(0);
  });
});
