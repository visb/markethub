import { AdminOrderSupportService } from "./admin-order-support.service";

/**
 * Story 67: ferramentas de suporte do pedido no admin — timeline (merge outbox +
 * marcos de timestamps, ordenado), cancelamento admin (delegado ao marketplace)
 * e reembolso manual (teto + evento durável `order.refund_requested`).
 * Prisma/OrdersService/Outbox mockados — sem DB.
 */

function makeDeps(opts: {
  order?: Record<string, unknown> | null;
  events?: Record<string, unknown>[];
  adminCancel?: jest.Mock;
} = {}) {
  const tx = {}; // publish recebe o client transacional
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
    outboxEvent: { findMany: jest.fn().mockResolvedValue(opts.events ?? []) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const orders = { adminCancel: opts.adminCancel ?? jest.fn().mockResolvedValue({ status: "canceled" }) };
  const outbox = { publish: jest.fn().mockResolvedValue({ id: "evt1" }) };
  const svc = new AdminOrderSupportService(prisma as never, orders as never, outbox as never);
  return { svc, prisma, orders, outbox, tx };
}

describe("AdminOrderSupportService.timeline", () => {
  const baseOrder = {
    id: "o1",
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    payment: { paidAt: new Date("2026-07-01T10:05:00.000Z") },
    groups: [
      {
        id: "g1",
        store: { name: "Loja Centro" },
        pickTask: {
          startedAt: new Date("2026-07-01T10:10:00.000Z"),
          readyAt: new Date("2026-07-01T10:30:00.000Z"),
        },
        delivery: {
          assignedAt: new Date("2026-07-01T10:35:00.000Z"),
          pickedUpAt: new Date("2026-07-01T10:40:00.000Z"),
          deliveredAt: new Date("2026-07-01T11:00:00.000Z"),
          failedAt: null,
          failReason: null,
          failNote: null,
          driver: { name: "Carlos" },
        },
      },
    ],
  };

  it("mescla eventos do outbox com os marcos e ordena cronologicamente", async () => {
    const { svc } = makeDeps({
      order: baseOrder,
      events: [
        {
          type: "order.created",
          payload: { orderId: "o1" },
          createdAt: new Date("2026-07-01T10:00:00.500Z"),
        },
        {
          type: "order.paid",
          payload: { orderId: "o1" },
          createdAt: new Date("2026-07-01T10:05:00.500Z"),
        },
      ],
    });
    const out = await svc.timeline("o1");

    // ordenado por at crescente
    const ats = out.map((i) => i.at);
    expect(ats).toEqual([...ats].sort());

    expect(out[0]).toMatchObject({ kind: "milestone.created", label: "Pedido criado" });
    expect(out.map((i) => i.kind)).toEqual([
      "milestone.created",
      "event.order.created",
      "milestone.paid",
      "event.order.paid",
      "milestone.picking",
      "milestone.ready",
      "milestone.delivery_assigned",
      "milestone.on_the_way",
      "milestone.delivered",
    ]);
    // rótulo pt-BR do evento + meta com o payload cru
    const paidEvent = out.find((i) => i.kind === "event.order.paid")!;
    expect(paidEvent.label).toBe("Pagamento confirmado");
    expect(paidEvent.meta).toEqual({ orderId: "o1" });
    // marcos por grupo carregam a loja no rótulo e meta
    const picking = out.find((i) => i.kind === "milestone.picking")!;
    expect(picking.label).toBe("Separação iniciada — Loja Centro");
    expect(picking.meta).toMatchObject({ groupId: "g1", store: "Loja Centro" });
    const onTheWay = out.find((i) => i.kind === "milestone.on_the_way")!;
    expect(onTheWay.meta).toMatchObject({ driver: "Carlos" });
  });

  it("pedido sem eventos no outbox ainda rende os marcos (ao menos o created)", async () => {
    const { svc } = makeDeps({
      order: { ...baseOrder, payment: null, groups: [] },
      events: [],
    });
    const out = await svc.timeline("o1");
    expect(out).toEqual([
      { at: "2026-07-01T10:00:00.000Z", kind: "milestone.created", label: "Pedido criado", meta: null },
    ]);
  });

  it("entrega com falha (story 61) entra na timeline com motivo", async () => {
    const { svc } = makeDeps({
      order: {
        ...baseOrder,
        payment: null,
        groups: [
          {
            id: "g1",
            store: { name: "Loja Centro" },
            pickTask: null,
            delivery: {
              assignedAt: null,
              pickedUpAt: null,
              deliveredAt: null,
              failedAt: new Date("2026-07-01T11:10:00.000Z"),
              failReason: "customer_absent",
              failNote: "ninguém atendeu",
              driver: null,
            },
          },
        ],
      },
    });
    const out = await svc.timeline("o1");
    const failed = out.find((i) => i.kind === "milestone.delivery_failed")!;
    expect(failed.label).toBe("Falha na entrega — Loja Centro");
    expect(failed.meta).toMatchObject({ failReason: "customer_absent", failNote: "ninguém atendeu" });
  });

  it("evento de tipo desconhecido usa o próprio type como rótulo", async () => {
    const { svc } = makeDeps({
      order: { ...baseOrder, payment: null, groups: [] },
      events: [{ type: "order.exotico", payload: null, createdAt: new Date("2026-07-01T12:00:00.000Z") }],
    });
    const out = await svc.timeline("o1");
    expect(out[1]).toMatchObject({ kind: "event.order.exotico", label: "order.exotico", meta: null });
  });

  it("pedido inexistente → ORDER_NOT_FOUND", async () => {
    const { svc } = makeDeps({ order: null });
    await expect(svc.timeline("x")).rejects.toMatchObject({ response: { code: "ORDER_NOT_FOUND" } });
  });
});

describe("AdminOrderSupportService.cancel", () => {
  it("delega ao marketplace (dono do agregado) com o motivo", async () => {
    const adminCancel = jest.fn().mockResolvedValue({ id: "o1", status: "canceled" });
    const { svc } = makeDeps({ adminCancel });
    const res = await svc.cancel("o1", "cliente pediu");
    expect(adminCancel).toHaveBeenCalledWith("o1", "cliente pediu");
    expect(res).toMatchObject({ status: "canceled" });
  });

  it("sem motivo → null", async () => {
    const adminCancel = jest.fn().mockResolvedValue({});
    const { svc } = makeDeps({ adminCancel });
    await svc.cancel("o1");
    expect(adminCancel).toHaveBeenCalledWith("o1", null);
  });
});

describe("AdminOrderSupportService.manualRefund (story 67 — teto = pago − reembolsado)", () => {
  const paidOrder = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    payment: { status: "paid", amountCents: 10000 },
    refund: null,
    groups: [{ id: "g1" }, { id: "g2" }],
    ...over,
  });

  it("dentro do teto: emite order.refund_requested no outbox (TX) com createdById do admin", async () => {
    const { svc, outbox, tx } = makeDeps({ order: paidOrder() });
    const res = await svc.manualRefund("o1", "admin1", {
      orderGroupId: "g1",
      amountCents: 2500,
      note: "cliente reclamou",
    });

    expect(outbox.publish).toHaveBeenCalledTimes(1);
    const [txArg, event] = outbox.publish.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(txArg).toBe(tx); // client transacional — atômico
    expect(event).toMatchObject({
      type: "order.refund_requested",
      aggregateId: "o1",
      payload: expect.objectContaining({
        orderId: "o1",
        groupId: "g1",
        amountCents: 2500,
        createdById: "admin1",
        note: "cliente reclamou",
      }),
    });
    const payload = event.payload as { componentId: string };
    expect(payload.componentId).toEqual(expect.any(String));
    expect(res).toMatchObject({
      componentId: payload.componentId,
      orderGroupId: "g1",
      amountCents: 2500,
      remainingCents: 7500,
      status: "requested",
    });
  });

  it("acúmulo: teto desconta o já reembolsado (Refund não-failed)", async () => {
    const { svc, outbox } = makeDeps({
      order: paidOrder({ refund: { status: "processed", amountCents: 9000 } }),
    });
    await expect(
      svc.manualRefund("o1", "admin1", { orderGroupId: "g1", amountCents: 1500 }),
    ).rejects.toMatchObject({ response: { code: "REFUND_EXCEEDS_PAID" } });
    expect(outbox.publish).not.toHaveBeenCalled();

    // exatamente o restante passa
    const res = await svc.manualRefund("o1", "admin1", { orderGroupId: "g1", amountCents: 1000 });
    expect(res.remainingCents).toBe(0);
  });

  it("refund failed não conta no teto (nada saiu do gateway)", async () => {
    const { svc } = makeDeps({
      order: paidOrder({ refund: { status: "failed", amountCents: 9000 } }),
    });
    const res = await svc.manualRefund("o1", "admin1", { orderGroupId: "g1", amountCents: 9500 });
    expect(res.remainingCents).toBe(500);
  });

  it("valor acima do teto → REFUND_EXCEEDS_PAID", async () => {
    const { svc, outbox } = makeDeps({ order: paidOrder() });
    await expect(
      svc.manualRefund("o1", "admin1", { orderGroupId: "g1", amountCents: 10001 }),
    ).rejects.toMatchObject({ response: { code: "REFUND_EXCEEDS_PAID" } });
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it.each([0, -100, 10.5])("valor inválido (%p) → INVALID_REFUND_AMOUNT", async (amountCents) => {
    const { svc, outbox } = makeDeps({ order: paidOrder() });
    await expect(
      svc.manualRefund("o1", "admin1", { orderGroupId: "g1", amountCents }),
    ).rejects.toMatchObject({ response: { code: "INVALID_REFUND_AMOUNT" } });
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("grupo de outro pedido → ORDER_GROUP_NOT_FOUND", async () => {
    const { svc } = makeDeps({ order: paidOrder() });
    await expect(
      svc.manualRefund("o1", "admin1", { orderGroupId: "g9", amountCents: 100 }),
    ).rejects.toMatchObject({ response: { code: "ORDER_GROUP_NOT_FOUND" } });
  });

  it("pedido não pago → ORDER_NOT_PAID", async () => {
    const { svc } = makeDeps({
      order: paidOrder({ payment: { status: "pending", amountCents: 10000 } }),
    });
    await expect(
      svc.manualRefund("o1", "admin1", { orderGroupId: "g1", amountCents: 100 }),
    ).rejects.toMatchObject({ response: { code: "ORDER_NOT_PAID" } });
  });

  it("pedido inexistente → ORDER_NOT_FOUND", async () => {
    const { svc } = makeDeps({ order: null });
    await expect(
      svc.manualRefund("x", "admin1", { orderGroupId: "g1", amountCents: 100 }),
    ).rejects.toMatchObject({ response: { code: "ORDER_NOT_FOUND" } });
  });
});
