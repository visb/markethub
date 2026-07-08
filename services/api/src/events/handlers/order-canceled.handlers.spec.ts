import { OrderCanceledHandlers } from "./order-canceled.handlers";

/**
 * Story 48: side-effects do `order.canceled` como handlers independentes —
 * antes encadeados inline no OrdersService.cancel pós-TX (slot + refund com
 * provider no request + notificações fire-and-forget). Cada handler roda em
 * fila própria (retry isolado: estorno fora do ar não bloqueia liberar-slot /
 * notificar) e é idempotente sob reentrega além da trava ProcessedEvent: o
 * estorno é 1 por pedido (unique orderId; coberto no spec do RefundService) e a
 * notificação reemite o status ATUAL do grupo (inócuo).
 */

const GROUPS = [
  { merchantId: "m1", storeId: "s1", status: "canceled" },
  { merchantId: "m2", storeId: "s2", status: "canceled" },
];

function makeHandlers(opts: { groups?: Record<string, unknown>[] } = {}) {
  const groupFindMany = jest.fn().mockResolvedValue(opts.groups ?? GROUPS);
  const prisma = { orderGroup: { findMany: groupFindMany } } as never;
  const scheduling = { release: jest.fn().mockResolvedValue(undefined) };
  const refund = {
    issueCancelRefund: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const tracking = { emit: jest.fn().mockResolvedValue(undefined) };
  const integration = { emit: jest.fn().mockResolvedValue(undefined) };
  const orderEvents = { statusChanged: jest.fn() };
  const svc = new OrderCanceledHandlers(
    prisma,
    scheduling as never,
    refund as never,
    tracking as never,
    integration as never,
    orderEvents as never,
  );
  return { svc, groupFindMany, scheduling, refund, tracking, integration, orderEvents };
}

describe("OrderCanceledHandlers.liberarSlot", () => {
  it("pedido com slot reservado: devolve a vaga (S5.3)", async () => {
    const { svc, scheduling } = makeHandlers();
    await svc.liberarSlot({ orderId: "o1", deliverySlotId: "slot1" });
    expect(scheduling.release).toHaveBeenCalledWith("slot1");
  });

  it("pedido sem slot: no-op", async () => {
    const { svc, scheduling } = makeHandlers();
    await svc.liberarSlot({ orderId: "o1", deliverySlotId: null });
    expect(scheduling.release).not.toHaveBeenCalled();
  });

  it("falha do release propaga (BullMQ retenta só este handler)", async () => {
    const { svc, scheduling } = makeHandlers();
    scheduling.release.mockRejectedValue(new Error("db fora"));
    await expect(svc.liberarSlot({ orderId: "o1", deliverySlotId: "slot1" })).rejects.toThrow(
      "db fora",
    );
  });
});

describe("OrderCanceledHandlers.emitirEstorno", () => {
  it("delega ao issueCancelRefund (guard não-pago → no-op e unique(orderId) vivem lá)", async () => {
    const { svc, refund } = makeHandlers();
    await svc.emitirEstorno({ orderId: "o1", deliverySlotId: null });
    expect(refund.issueCancelRefund).toHaveBeenCalledWith("o1");
  });

  it("falha do provider PROPAGA (job retenta) sem marcar failed aqui", async () => {
    const { svc, refund } = makeHandlers();
    refund.issueCancelRefund.mockRejectedValue(new Error("gateway down"));
    await expect(svc.emitirEstorno({ orderId: "o1", deliverySlotId: null })).rejects.toThrow(
      "gateway down",
    );
    expect(refund.markFailed).not.toHaveBeenCalled();
  });

  it("retry isolado: estorno falhando não impede liberar-slot nem notificar (filas separadas)", async () => {
    const { svc, refund, scheduling, integration } = makeHandlers();
    refund.issueCancelRefund.mockRejectedValue(new Error("gateway down"));
    await expect(svc.emitirEstorno({ orderId: "o1", deliverySlotId: "slot1" })).rejects.toThrow();
    // os outros handlers seguem funcionando de forma independente
    await svc.liberarSlot({ orderId: "o1", deliverySlotId: "slot1" });
    await svc.notificar({ orderId: "o1", deliverySlotId: "slot1" });
    expect(scheduling.release).toHaveBeenCalledWith("slot1");
    expect(integration.emit).toHaveBeenCalled();
  });
});

describe("OrderCanceledHandlers.estornoEsgotado (retries esgotados)", () => {
  it("marca o refund do pedido como failed (auditável)", async () => {
    const { svc, refund } = makeHandlers();
    await svc.estornoEsgotado({ orderId: "o1", deliverySlotId: null });
    expect(refund.markFailed).toHaveBeenCalledWith("o1");
  });
});

describe("OrderCanceledHandlers.notificar", () => {
  it("rastreio agregado + webhook/socket POR GRUPO com o status atual", async () => {
    const { svc, tracking, integration, orderEvents } = makeHandlers();
    await svc.notificar({ orderId: "o1", deliverySlotId: null });

    expect(tracking.emit).toHaveBeenCalledWith("o1");
    expect(integration.emit).toHaveBeenCalledTimes(2);
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.status_changed", {
      orderId: "o1",
      merchantId: "m1",
      storeId: "s1",
      status: "canceled",
    });
    expect(integration.emit).toHaveBeenCalledWith("m2", "order.status_changed", {
      orderId: "o1",
      merchantId: "m2",
      storeId: "s2",
      status: "canceled",
    });
    expect(orderEvents.statusChanged).toHaveBeenCalledTimes(2);
    expect(orderEvents.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m1", status: "canceled" }),
    );
  });

  it("relê o estado: emite o status ATUAL do grupo (idempotente sob reentrega)", async () => {
    const { svc, integration } = makeHandlers({
      groups: [{ merchantId: "m1", storeId: "s1", status: "created" }],
    });
    await svc.notificar({ orderId: "o1", deliverySlotId: null });
    expect(integration.emit).toHaveBeenCalledWith(
      "m1",
      "order.status_changed",
      expect.objectContaining({ status: "created" }),
    );
  });

  it("pedido sem grupos (cascade delete): no-op", async () => {
    const { svc, tracking, integration } = makeHandlers({ groups: [] });
    await svc.notificar({ orderId: "o1", deliverySlotId: null });
    expect(tracking.emit).not.toHaveBeenCalled();
    expect(integration.emit).not.toHaveBeenCalled();
  });

  it("falha do webhook propaga p/ retry isolado", async () => {
    const { svc, integration } = makeHandlers();
    integration.emit.mockRejectedValue(new Error("webhook fora"));
    await expect(svc.notificar({ orderId: "o1", deliverySlotId: null })).rejects.toThrow(
      "webhook fora",
    );
  });
});
