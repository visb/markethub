import { Prisma } from "@prisma/client";
import { RefundService } from "./refund.service";

/**
 * Story 20: cobertura do RefundService (SF.3) — orquestração do estorno único por
 * pedido. Cobre estorno integral de cancelamento e estorno consolidado de faltas
 * (peso menor / item recusado), idempotência e valor já reembolsado. O cálculo
 * puro (itemShortfall) já está coberto em refund.pricing.spec.ts.
 *
 * Story 48 (estorno durável): falha do provider PROPAGA (o chamador é handler de
 * evento em fila BullMQ — o erro é o que faz o retry), refund `pending` deixado
 * por tentativa anterior é RETOMADO sem recriar, corrida do unique (P2002) segue
 * short-circuit silencioso e `failed` só é gravado no esgotamento (markFailed).
 */

type OrderShape = Record<string, unknown> | null;

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
  });
}

function makeService(opts: {
  order?: OrderShape;
  createError?: Error;
  refundResult?: { refundId: string; raw?: unknown };
  refundThrows?: boolean;
}) {
  const refundCreate = opts.createError
    ? jest.fn().mockRejectedValue(opts.createError)
    : // ecoa os dados criados (o service processa no gateway com a row criada)
      jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: "ref1", ...data }),
      );
  const refundUpdate = jest.fn().mockResolvedValue({});
  const refundUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
    refund: { create: refundCreate, update: refundUpdate, updateMany: refundUpdateMany },
  } as never;

  const refund = opts.refundThrows
    ? jest.fn().mockRejectedValue(new Error("gateway down"))
    : jest.fn().mockResolvedValue(opts.refundResult ?? { refundId: "prov_ref1", raw: {} });
  const provider = { name: "mock", refund } as never;

  const svc = new RefundService(prisma, provider);
  return { svc, refundCreate, refundUpdate, refundUpdateMany, providerRefund: refund };
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

  it("idempotente: reembolso já processado → não recria nem reprocessa", async () => {
    const { svc, refundCreate, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: { id: "ref0", status: "processed" } },
    });
    await svc.issueCancelRefund("o1");
    expect(refundCreate).not.toHaveBeenCalled();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("reembolso já esgotado (failed) → no-op (auditável; não reprocessa sozinho)", async () => {
    const { svc, refundCreate, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: { id: "ref0", status: "failed" } },
    });
    await svc.issueCancelRefund("o1");
    expect(refundCreate).not.toHaveBeenCalled();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("retomada (retry do BullMQ): refund pending de tentativa anterior → reprocessa no gateway SEM recriar", async () => {
    const { svc, refundCreate, refundUpdate, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: { id: "ref0", status: "pending", amountCents: 4200, reason: "customer_cancel" },
      },
    });
    await svc.issueCancelRefund("o1");
    expect(refundCreate).not.toHaveBeenCalled();
    // usa os dados da PRÓPRIA row pendente (não recalcula do payment)
    expect(providerRefund).toHaveBeenCalledWith({
      chargeId: "ch_paid",
      amountCents: 4200,
      reason: "customer_cancel",
    });
    expect(refundUpdate).toHaveBeenCalledWith({
      where: { id: "ref0" },
      data: expect.objectContaining({ status: "processed", providerRefundId: "prov_ref1" }),
    });
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

  it("corrida na criação (unique P2002) → short-circuit sem erro e sem chamar o provider", async () => {
    const { svc, providerRefund } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null },
      createError: p2002(),
    });
    await expect(svc.issueCancelRefund("o1")).resolves.toBeUndefined();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("erro de banco que NÃO é P2002 na criação propaga (não mascara como corrida)", async () => {
    const { svc } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null },
      createError: new Error("db fora"),
    });
    await expect(svc.issueCancelRefund("o1")).rejects.toThrow("db fora");
  });

  it("falha do provedor PROPAGA (job retenta) e NÃO crava failed — refund segue pending", async () => {
    const { svc, refundUpdate } = makeService({
      order: { id: "o1", payment: paidPayment(), refund: null },
      refundThrows: true,
    });
    await expect(svc.issueCancelRefund("o1")).rejects.toThrow("gateway down");
    expect(refundUpdate).not.toHaveBeenCalled();
  });
});

describe("RefundService.markFailed (esgotamento dos retries — story 48)", () => {
  it("marca failed apenas refund ainda pending do pedido", async () => {
    const { svc, refundUpdateMany } = makeService({});
    await svc.markFailed("o1");
    expect(refundUpdateMany).toHaveBeenCalledWith({
      where: { orderId: "o1", status: "pending" },
      data: { status: "failed" },
    });
  });

  it("sem refund pending (processed venceu a corrida ou nada criado) → no-op silencioso", async () => {
    const { svc, refundUpdateMany } = makeService({});
    refundUpdateMany.mockResolvedValue({ count: 0 });
    await expect(svc.markFailed("o1")).resolves.toBeUndefined();
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

  it("idempotente: já existe reembolso processado → não recria", async () => {
    const { svc, refundCreate, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: { id: "ref0", status: "processed" },
        groups: [group("packed", [weightShortItem()])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("retomada (retry do BullMQ): refund pending anterior → reprocessa no gateway SEM recriar", async () => {
    const { svc, refundCreate, refundUpdate, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: { id: "ref0", status: "pending", amountCents: 200, reason: "weight_shortfall" },
        groups: [group("packed", [weightShortItem()])],
      },
    });
    await svc.maybeIssueRefundForOrder("o1");
    expect(refundCreate).not.toHaveBeenCalled();
    expect(providerRefund).toHaveBeenCalledWith({
      chargeId: "ch_paid",
      amountCents: 200,
      reason: "weight_shortfall",
    });
    expect(refundUpdate).toHaveBeenCalledWith({
      where: { id: "ref0" },
      data: expect.objectContaining({ status: "processed" }),
    });
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

  it("corrida na criação (unique P2002) → short-circuit sem erro e sem chamar o provider", async () => {
    const { svc, providerRefund } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [weightShortItem()])],
      },
      createError: p2002(),
    });
    await expect(svc.maybeIssueRefundForOrder("o1")).resolves.toBeUndefined();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("falha do provedor PROPAGA (job retenta) e NÃO crava failed", async () => {
    const { svc, refundUpdate } = makeService({
      order: {
        id: "o1",
        payment: paidPayment(),
        refund: null,
        groups: [group("packed", [weightShortItem()])],
      },
      refundThrows: true,
    });
    await expect(svc.maybeIssueRefundForOrder("o1")).rejects.toThrow("gateway down");
    expect(refundUpdate).not.toHaveBeenCalled();
  });
});

/**
 * Story 54: estorno PARCIAL ao cancelar um sub-pedido (OrderGroup). Acumula um
 * RefundComponent group_canceled no Refund 1:1 do pedido e estorna o valor
 * rateado no gateway. Idempotente pela presença do componente do grupo.
 */
describe("RefundService.issueGroupCancelRefund", () => {
  function makeSvc(opts: { order?: Record<string, unknown> | null; refundThrows?: boolean } = {}) {
    const txRefundCreate = jest.fn().mockResolvedValue({ id: "ref1" });
    const txRefundUpdate = jest.fn().mockResolvedValue({});
    const tx = { refund: { create: txRefundCreate, update: txRefundUpdate } };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as never;
    const providerRefund = opts.refundThrows
      ? jest.fn().mockRejectedValue(new Error("gateway down"))
      : jest.fn().mockResolvedValue({ refundId: "prov_ref9" });
    const provider = { name: "mock", refund: providerRefund } as never;
    const svc = new RefundService(prisma, provider);
    return { svc, txRefundCreate, txRefundUpdate, providerRefund };
  }

  const paid = { status: "paid", amountCents: 10000, provider: "mock", providerChargeId: "ch1" };

  it("sem Refund ainda: estorna no gateway e cria o Refund com o component do grupo", async () => {
    const { svc, txRefundCreate, providerRefund } = makeSvc({
      order: { id: "o1", payment: paid, refund: null },
    });
    await svc.issueGroupCancelRefund("o1", "g1", 5400, "group_canceled");
    expect(providerRefund).toHaveBeenCalledWith({ chargeId: "ch1", amountCents: 5400, reason: "group_canceled" });
    expect(txRefundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "o1",
          amountCents: 5400,
          status: "processed",
          components: { create: { orderGroupId: "g1", amountCents: 5400, reason: "group_canceled" } },
        }),
      }),
    );
  });

  it("Refund já existe (outro grupo cancelado): acumula amountCents + novo component", async () => {
    const { svc, txRefundUpdate } = makeSvc({
      order: {
        id: "o1",
        payment: paid,
        refund: { id: "ref1", components: [{ orderGroupId: "g0", reason: "group_canceled" }] },
      },
    });
    await svc.issueGroupCancelRefund("o1", "g1", 3600, "group_canceled");
    expect(txRefundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ref1" },
        data: expect.objectContaining({
          amountCents: { increment: 3600 },
          status: "processed",
          components: { create: { orderGroupId: "g1", amountCents: 3600, reason: "group_canceled" } },
        }),
      }),
    );
  });

  it("idempotente: component group_canceled do grupo já existe → no-op (sem tocar o gateway)", async () => {
    const { svc, providerRefund, txRefundUpdate } = makeSvc({
      order: {
        id: "o1",
        payment: paid,
        refund: { id: "ref1", components: [{ orderGroupId: "g1", reason: "group_canceled" }] },
      },
    });
    await svc.issueGroupCancelRefund("o1", "g1", 3600, "group_canceled");
    expect(providerRefund).not.toHaveBeenCalled();
    expect(txRefundUpdate).not.toHaveBeenCalled();
  });

  it("amountCents <= 0 → no-op", async () => {
    const { svc, providerRefund } = makeSvc({ order: { id: "o1", payment: paid, refund: null } });
    await svc.issueGroupCancelRefund("o1", "g1", 0, "group_canceled");
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("pedido não pago → no-op", async () => {
    const { svc, providerRefund } = makeSvc({
      order: { id: "o1", payment: { status: "pending" }, refund: null },
    });
    await svc.issueGroupCancelRefund("o1", "g1", 5400, "group_canceled");
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("pedido inexistente → no-op", async () => {
    const { svc, providerRefund } = makeSvc({ order: null });
    await svc.issueGroupCancelRefund("o1", "g1", 5400, "group_canceled");
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it("falha do provider PROPAGA (job retenta) sem gravar Refund", async () => {
    const { svc, txRefundCreate } = makeSvc({
      order: { id: "o1", payment: paid, refund: null },
      refundThrows: true,
    });
    await expect(svc.issueGroupCancelRefund("o1", "g1", 5400, "group_canceled")).rejects.toThrow(
      "gateway down",
    );
    expect(txRefundCreate).not.toHaveBeenCalled();
  });
});
