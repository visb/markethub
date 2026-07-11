import { groupCancelRefundCents } from "./group-refund.pricing";

/**
 * Story 54: rateio do estorno ao cancelar um sub-pedido. Sem cupom = total do
 * grupo; com cupom = total menos a fatia proporcional; e a soma das fatias de
 * desconto de TODOS os grupos fecha exatamente com o desconto (método do prefixo).
 */
describe("groupCancelRefundCents", () => {
  it("sem cupom: estorno = total do grupo", () => {
    const groups = [
      { id: "a", totalCents: 6000 },
      { id: "b", totalCents: 4000 },
    ];
    expect(groupCancelRefundCents({ discountCents: 0, groups, groupId: "a" })).toBe(6000);
    expect(groupCancelRefundCents({ discountCents: 0, groups, groupId: "b" })).toBe(4000);
  });

  it("com cupom: estorno = total do grupo − desconto proporcional", () => {
    const groups = [
      { id: "a", totalCents: 6000 },
      { id: "b", totalCents: 4000 },
    ];
    // desconto 1000 sobre 10000: grupo a = 600, grupo b = 400
    expect(groupCancelRefundCents({ discountCents: 1000, groups, groupId: "a" })).toBe(5400);
    expect(groupCancelRefundCents({ discountCents: 1000, groups, groupId: "b" })).toBe(3600);
  });

  it("soma exata dos estornos = pago (total − desconto), mesmo com arredondamento", () => {
    const groups = [
      { id: "a", totalCents: 3333 },
      { id: "b", totalCents: 3333 },
      { id: "c", totalCents: 3334 },
    ];
    const discountCents = 1000;
    const sum =
      groupCancelRefundCents({ discountCents, groups, groupId: "a" }) +
      groupCancelRefundCents({ discountCents, groups, groupId: "b" }) +
      groupCancelRefundCents({ discountCents, groups, groupId: "c" });
    // 10000 − 1000 = 9000 exato
    expect(sum).toBe(9000);
  });

  it("soma das fatias de desconto = desconto (nada perdido no arredondamento)", () => {
    const groups = [
      { id: "a", totalCents: 3333 },
      { id: "b", totalCents: 3333 },
      { id: "c", totalCents: 3334 },
    ];
    const discountCents = 777;
    const orderTotal = 10000;
    const totalRefund =
      groupCancelRefundCents({ discountCents, groups, groupId: "a" }) +
      groupCancelRefundCents({ discountCents, groups, groupId: "b" }) +
      groupCancelRefundCents({ discountCents, groups, groupId: "c" });
    expect(orderTotal - totalRefund).toBe(discountCents);
  });

  it("grupo inexistente → 0", () => {
    expect(
      groupCancelRefundCents({ discountCents: 0, groups: [{ id: "a", totalCents: 100 }], groupId: "x" }),
    ).toBe(0);
  });

  it("pedido de total zero → 0 (sem divisão por zero)", () => {
    expect(
      groupCancelRefundCents({ discountCents: 0, groups: [{ id: "a", totalCents: 0 }], groupId: "a" }),
    ).toBe(0);
  });

  it("grupo único com cupom: estorno = pago (total − desconto inteiro)", () => {
    const groups = [{ id: "a", totalCents: 5000 }];
    expect(groupCancelRefundCents({ discountCents: 800, groups, groupId: "a" })).toBe(4200);
  });
});
