import { PickingDoneHandlers } from "./picking-done.handlers";

/**
 * Story 46: side-effects do `picking.done` como handlers independentes — cada
 * um relê o estado por orderGroupId (payload mínimo) e é idempotente sob
 * reentrega por construção (Delivery upsert com update vazio não reabre
 * entrega já iniciada; notificar reemite o status atual, inócuo), além da
 * trava ProcessedEvent. Falha de um não afeta o outro (filas separadas).
 */

const GROUP = {
  orderId: "o1",
  merchantId: "m1",
  storeId: "s1",
  status: "ready_for_pickup",
  fulfillment: "delivery",
  order: { userId: "owner1" },
};

function makeHandlers(opts: {
  group?: Record<string, unknown> | null;
  task?: Record<string, unknown> | null;
} = {}) {
  const groupFindUnique = jest.fn().mockResolvedValue("group" in opts ? opts.group : GROUP);
  const deliveryUpsert = jest.fn().mockResolvedValue({ id: "d1" });
  const taskFindUnique = jest
    .fn()
    .mockResolvedValue("task" in opts ? opts.task : { id: "t1", storeId: "s1" });
  const prisma = {
    orderGroup: { findUnique: groupFindUnique },
    delivery: { upsert: deliveryUpsert },
    pickTask: { findUnique: taskFindUnique },
  } as never;
  const tracking = { recomputeAndEmit: jest.fn().mockResolvedValue(undefined) };
  const integration = { emit: jest.fn().mockResolvedValue(undefined) };
  const orderEvents = { statusChanged: jest.fn() };
  const pickingEvents = { readyForPickup: jest.fn() };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const refund = {
    maybeIssueRefundForOrder: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new PickingDoneHandlers(
    prisma,
    tracking as never,
    integration as never,
    orderEvents as never,
    pickingEvents as never,
    push as never,
    refund as never,
  );
  return {
    svc,
    groupFindUnique,
    deliveryUpsert,
    tracking,
    integration,
    orderEvents,
    pickingEvents,
    push,
    refund,
  };
}

const payload = { orderGroupId: "g1" };

describe("PickingDoneHandlers.iniciarEntrega", () => {
  it("entrega própria: cria a Delivery (unassigned) da loja via upsert", async () => {
    const { svc, deliveryUpsert } = makeHandlers();
    await svc.iniciarEntrega(payload);
    expect(deliveryUpsert).toHaveBeenCalledWith({
      where: { orderGroupId: "g1" },
      create: { orderGroupId: "g1", storeId: "s1" },
      update: {},
    });
  });

  it("reentrega não reabre entrega já iniciada (upsert com update VAZIO)", async () => {
    const { svc, deliveryUpsert } = makeHandlers();
    await svc.iniciarEntrega(payload);
    await svc.iniciarEntrega(payload);
    expect(deliveryUpsert).toHaveBeenCalledTimes(2);
    for (const call of deliveryUpsert.mock.calls) {
      expect((call[0] as { update: object }).update).toEqual({});
    }
  });

  it("retirada na loja (pickup) não gera entrega", async () => {
    const { svc, deliveryUpsert } = makeHandlers({ group: { ...GROUP, fulfillment: "pickup" } });
    await svc.iniciarEntrega(payload);
    expect(deliveryUpsert).not.toHaveBeenCalled();
  });

  it("grupo cancelado nesse meio-tempo não gera entrega", async () => {
    const { svc, deliveryUpsert } = makeHandlers({ group: { ...GROUP, status: "canceled" } });
    await svc.iniciarEntrega(payload);
    expect(deliveryUpsert).not.toHaveBeenCalled();
  });

  it("grupo inexistente: no-op (reentrega após cascade delete não explode)", async () => {
    const { svc, deliveryUpsert } = makeHandlers({ group: null });
    await svc.iniciarEntrega(payload);
    expect(deliveryUpsert).not.toHaveBeenCalled();
  });

  it("falha do banco propaga (BullMQ retenta só este handler)", async () => {
    const { svc, deliveryUpsert } = makeHandlers();
    deliveryUpsert.mockRejectedValue(new Error("db fora"));
    await expect(svc.iniciarEntrega(payload)).rejects.toThrow("db fora");
  });
});

describe("PickingDoneHandlers.notificar", () => {
  it("recompute do tracking + webhook/socket com o status ATUAL + fila de coleta + push ao dono", async () => {
    const { svc, tracking, integration, orderEvents, pickingEvents, push } = makeHandlers();
    await svc.notificar(payload);

    expect(tracking.recomputeAndEmit).toHaveBeenCalledWith("g1");
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.status_changed", {
      orderId: "o1",
      merchantId: "m1",
      storeId: "s1",
      status: "ready_for_pickup",
    });
    expect(orderEvents.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready_for_pickup" }),
    );
    expect(pickingEvents.readyForPickup).toHaveBeenCalledWith({
      pickTaskId: "t1",
      storeId: "s1",
      orderGroupId: "g1",
    });
    expect(push.sendToUser).toHaveBeenCalledWith("owner1", {
      title: "Pedido pronto",
      body: "Seu pedido foi separado e aguarda coleta.",
      data: { orderId: "o1", route: "/track/o1" },
    });
  });

  it("retirada na loja: push com a mensagem de retirada", async () => {
    const { svc, push } = makeHandlers({ group: { ...GROUP, fulfillment: "pickup" } });
    await svc.notificar(payload);
    expect(push.sendToUser).toHaveBeenCalledWith(
      "owner1",
      expect.objectContaining({ body: "Seu pedido está pronto para retirada na loja." }),
    );
  });

  it("relê o estado: reentrega tardia emite o status corrente (não ready_for_pickup cravado)", async () => {
    const { svc, integration } = makeHandlers({ group: { ...GROUP, status: "on_the_way" } });
    await svc.notificar(payload);
    expect(integration.emit).toHaveBeenCalledWith(
      "m1",
      "order.status_changed",
      expect.objectContaining({ status: "on_the_way" }),
    );
  });

  it("grupo inexistente: no-op", async () => {
    const { svc, tracking, integration, push } = makeHandlers({ group: null });
    await svc.notificar(payload);
    expect(tracking.recomputeAndEmit).not.toHaveBeenCalled();
    expect(integration.emit).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it("sem PickTask (expurgada): pula o socket da fila de coleta mas segue com o push", async () => {
    const { svc, pickingEvents, push } = makeHandlers({ task: null });
    await svc.notificar(payload);
    expect(pickingEvents.readyForPickup).not.toHaveBeenCalled();
    expect(push.sendToUser).toHaveBeenCalled();
  });

  it("falha do webhook propaga p/ retry isolado (não toca a criação da Delivery)", async () => {
    const { svc, integration, deliveryUpsert } = makeHandlers();
    integration.emit.mockRejectedValue(new Error("webhook fora"));
    await expect(svc.notificar(payload)).rejects.toThrow("webhook fora");
    expect(deliveryUpsert).not.toHaveBeenCalled();
  });
});

/**
 * Story 48: estorno de shortfall saiu do completePicking síncrono (provider no
 * caminho, sem retry) e virou handler do `picking.done`. O gatilho "todas as
 * separações concluídas" e a idempotência (refund existente → no-op; unique
 * orderId) já vivem no maybeIssueRefundForOrder — cobertos no spec do refund.
 */
describe("PickingDoneHandlers.verificarShortfallRefund", () => {
  it("resolve o orderId do grupo e delega ao maybeIssueRefundForOrder", async () => {
    const { svc, refund } = makeHandlers();
    await svc.verificarShortfallRefund(payload);
    expect(refund.maybeIssueRefundForOrder).toHaveBeenCalledWith("o1");
  });

  it("grupo inexistente (cascade delete): no-op sem explodir", async () => {
    const { svc, refund } = makeHandlers({ group: null });
    await svc.verificarShortfallRefund(payload);
    expect(refund.maybeIssueRefundForOrder).not.toHaveBeenCalled();
  });

  it("falha do provider PROPAGA (BullMQ retenta só esta fila; failed apenas no esgotamento)", async () => {
    const { svc, refund } = makeHandlers();
    refund.maybeIssueRefundForOrder.mockRejectedValue(new Error("gateway down"));
    await expect(svc.verificarShortfallRefund(payload)).rejects.toThrow("gateway down");
    expect(refund.markFailed).not.toHaveBeenCalled();
  });
});

describe("PickingDoneHandlers.shortfallEsgotado (retries esgotados)", () => {
  it("marca o refund do pedido como failed (auditável)", async () => {
    const { svc, refund } = makeHandlers();
    await svc.shortfallEsgotado(payload);
    expect(refund.markFailed).toHaveBeenCalledWith("o1");
  });

  it("grupo inexistente: no-op", async () => {
    const { svc, refund } = makeHandlers({ group: null });
    await svc.shortfallEsgotado(payload);
    expect(refund.markFailed).not.toHaveBeenCalled();
  });
});
