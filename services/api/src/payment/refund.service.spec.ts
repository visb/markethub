import { RefundService } from "./refund.service";

/**
 * Story 20: cobertura do RefundService (SF.3) — orquestração do estorno único por
 * pedido. Cobre estorno integral de cancelamento e estorno consolidado de faltas
 * (peso menor / item recusado), idempotência, falha do provedor e valor já reembolsado.
 * O cálculo puro (itemShortfall) já está coberto em refund.pricing.spec.ts.
 */

type OrderShape = Record<string, unknown> | null;

function makeService(opts: {
  order?: OrderShape;
  createThrows?: boolean;
  refundResult?: { refundId: string; raw?: unknown };
  refundThrows?: boolean;
}) {
  const refundCreate = opts.createThrows
    ? jest.fn().mockRejectedValue(new Error("unique violation"))
    : jest.fn().mockResolvedValue({ id: "ref1" });
  const refundUpdate = jest.fn().mockResolvedValue({});

  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
    refund: { create: refundCreate, update: refundUpdate },
  } as never;

  const refund = opts.refundThrows
    ? jest.fn().mockRejectedValue(new Error("gateway down"))
    : jest.fn().mockResolvedValue(opts.refundResult ?? { refundId: "prov_ref1", raw: {} });
  const provider = { name: "mock", refund } as never;

  const svc = new RefundService(prisma, provider);
  return { svc, refundCreate, refundUpdate, providerRefund: refund };
}

const paidPayment = (over: Record<string, unknown> = {}) => ({
  status: "paid",
  amountCents: 5000,
  provider: "mock",
  providerChargeId: "ch_paid",
  ...over,
});

describe("RefundService.issueCancelRefund", () => {
  it("estorna o valor integral e marca processed", async () => {
    const { svc, refundCreate, refundUpdate, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null },
    });
    await svc.issueCancelRefund("o1");

    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "o1",
          amountCents: 5000,
          status: "pending",
          reason: "customer_cancel",
        }),
      }),
    );
    expect(providerRefund).toHaveBeenCalledWith({
      chargeId: "ch_paid",
      amountCents: 5000,
      reason: "customer_cancel",
    });
    expect(refundUpdate).toHaveBeenCalledWith({
      where: { id: "ref1" },
      data: expect.objectContaining({ status: "processed", providerRefundId: "prov_ref1" }),
    });
  });

  it("usa string vazia quando não há providerChargeId", async () => {
    const { svc, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment({ providerChargeId: null }), refund: null },
    });
    await svc.issueCancelRefund("o1");
    expect(providerRefund).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: "" }),
    );
  });

  it("não faz nada quando o pedido não existe", async () => {
    const { svc, refundCreate } = makeService({ order: null });
    await svc.issueCancelRefund("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("idempotente: já existe reembolso → não recria (REFUND_ALREADY_DONE)", async () => {
    const { svc, refundCreate, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: { id: "ref0" } },
    });
    await svc.issueCancelRefund("o1");
    expect(refundCreate).not.toHaveBeenCalled();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("não estorna pedido sem pagamento ou não pago", async () => {
    const noPay = makeService({ order: { id: "o1", payment: null, refund: null } });
    await noPay.svc.issueCancelRefund("o1");
    expect(noPay.refundCreate).not.toHaveBeenCalled();

    const pending = makeService({
      order: { id: "o1", payment: paidPayment({ status: "pending" }), refund: null },
    });
    await pending.svc.issueCancelRefund("o1");
    expect(pending.refundCreate).not.toHaveBeenCalled();
  });

  it("corrida na criação (unique orderId) → ignora sem chamar o provider", async () => {
    const { svc, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null },
      createThrows: true,
    });
    await svc.issueCancelRefund("o1");
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("falha do provedor → marca o reembolso como failed", async () => {
    const { svc, refundUpdate } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null },
      refundThrows: true,
    });
    await svc.issueCancelRefund("o1");
    expect(refundUpdate).toHaveBeenCalledWith({ where: { id: "ref1" }, data: { status: "failed" } });
  });
});

// Helpers para montar grupos/itens com falta.
const group = (status: string, items: unknown[]) => ({
  id: `g_${status}`,
  pickTask: { status },
  items,
});
const weightShortItem = () => ({
  saleType: "weight",
  unitPriceCents: 1000,
  quantity: 1,
  weightGrams: 1000,
  lineTotalCents: 1000,
  pickItem: { status: "picked", quantityPicked: null, weightGramsPicked: 800 }, // falta 200
});
const refusedItem = (lineTotalCents: number) => ({
  saleType: "unit",
  unitPriceCents: lineTotalCents,
  quantity: 1,
  weightGrams: null,
  lineTotalCents,
  pickItem: { status: "refused", quantityPicked: null, weightGramsPicked: null },
});
const fullItem = () => ({
  saleType: "unit",
  unitPriceCents: 500,
  quantity: 2,
  weightGrams: null,
  lineTotalCents: 1000,
  pickItem: { status: "picked", quantityPicked: 2, weightGramsPicked: null },
});

describe("RefundService.maybeIssueRefundForOrder", () => {
  it("consolida faltas e emite estorno parcial processed", async () => {
    const { svc, refundCreate, refundUpdate, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [weightShortItem(), fullItem()])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");

    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: "o1", amountCents: 200, status: "pending" }),
      }),
    );
    expect(providerRefund).toHaveBeenCalledWith(
      expect.objectContaining({ chargeId: "ch_paid", amountCents: 200 }),
    );
    expect(refundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "processed" }) }),
    );
  });

  it("soma faltas de múltiplos grupos (peso + recusa) e dispara um só estorno", async () => {
    const { svc, refundCreate, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [
          group("packed", [weightShortItem()]), // 200
          group("ready_for_pickup", [refusedItem(900)]), // 900
        ],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: 1100 }) }),
    );
    expect(providerRefund).toHaveBeenCalledTimes(1);
  });

  it("nunca estorna mais que o valor pago (cap em amountCents)", async () => {
    const { svc, refundCreate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment({ amountCents: 500 }),
        refund: null,
        groups: [group("packed", [refusedItem(900)])], // falta 900 > pago 500
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: 500 }) }),
    );
  });

  it("sem faltas → não cria reembolso", async () => {
    const { svc, refundCreate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [fullItem()])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("não estorna enquanto nem todas as separações concluíram", async () => {
    const { svc, refundCreate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [
          group("packed", [weightShortItem()]),
          group("picking", [weightShortItem()]), // ainda separando
        ],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("sem grupos → não estorna", async () => {
    const { svc, refundCreate } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null, groups: [] },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("ignora itens sem pickItem", async () => {
    const { svc, refundCreate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [{ ...weightShortItem(), pickItem: null }])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("pedido inexistente → nada", async () => {
    const { svc, refundCreate } = makeService({ order: null });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("idempotente: já existe reembolso → não recria", async () => {
    const { svc, refundCreate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: { id: "ref0" },
        groups: [group("packed", [weightShortItem()])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("pedido não pago → não estorna", async () => {
    const { svc, refundCreate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment({ status: "pending" }),
        refund: null,
        groups: [group("packed", [weightShortItem()])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it("corrida na criação (unique) → ignora sem chamar o provider", async () => {
    const { svc, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [weightShortItem()])],
      },
      createThrows: true,
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("falha do provedor → marca reembolso failed", async () => {
    const { svc, refundUpdate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [weightShortItem()])],
      },
      refundThrows: true,
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundUpdate).toHaveBeenCalledWith({ where: { id: "ref1" }, data: { status: "failed" } });
  });
});
