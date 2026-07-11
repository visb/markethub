import { OrderGroupCanceledHandlers } from "./order-group-canceled.handlers";

/**
 * Story 54: side-effects do `order.group_canceled` como handlers independentes —
 * estorno PARCIAL acumulado + notificação/push por grupo. Filas próprias (retry
 * isolado); idempotência do estorno vive no RefundService (component do grupo).
 */

const PAYLOAD = { orderId: "o1", groupId: "g1", amountCents: 5400, reason: "group_canceled" };

const GROUP = {
  orderId: "o1",
  merchantId: "m1",
  storeId: "s1",
  status: "canceled",
  store: { name: "Loja 1" },
  order: { userId: "u1" },
};

function makeHandlers(opts: { group?: Record<string, unknown> | null } = {}) {
  const groupFindUnique = jest.fn().mockResolvedValue("group" in opts ? opts.group : GROUP);
  const prisma = { orderGroup: { findUnique: groupFindUnique } } as never;
  const refund = {
    issueGroupCancelRefund: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const tracking = { emit: jest.fn().mockResolvedValue(undefined) };
  const integration = { emit: jest.fn().mockResolvedValue(undefined) };
  const orderEvents = { statusChanged: jest.fn() };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const svc = new OrderGroupCanceledHandlers(
    prisma,
    refund as never,
    tracking as never,
    integration as never,
    orderEvents as never,
    push as never,
  );
  return { svc, groupFindUnique, refund, tracking, integration, orderEvents, push };
}

describe("OrderGroupCanceledHandlers.emitirEstorno", () => {
  it("delega ao issueGroupCancelRefund com o valor rateado do payload", async () => {
    const { svc, refund } = makeHandlers();
    await svc.emitirEstorno(PAYLOAD);
    expect(refund.issueGroupCancelRefund).toHaveBeenCalledWith("o1", "g1", 5400, "group_canceled");
  });

  it("falha do provider PROPAGA (job retenta) sem marcar failed aqui", async () => {
    const { svc, refund } = makeHandlers();
    refund.issueGroupCancelRefund.mockRejectedValue(new Error("gateway down"));
    await expect(svc.emitirEstorno(PAYLOAD)).rejects.toThrow("gateway down");
    expect(refund.markFailed).not.toHaveBeenCalled();
  });
});

describe("OrderGroupCanceledHandlers.estornoEsgotado", () => {
  it("marca o Refund do pedido failed (auditável)", async () => {
    const { svc, refund } = makeHandlers();
    await svc.estornoEsgotado(PAYLOAD);
    expect(refund.markFailed).toHaveBeenCalledWith("o1");
  });
});

describe("OrderGroupCanceledHandlers.notificar", () => {
  it("rastreio + webhook/socket do grupo (status atual) + push ao cliente", async () => {
    const { svc, tracking, integration, orderEvents, push } = makeHandlers();
    await svc.notificar(PAYLOAD);
    expect(tracking.emit).toHaveBeenCalledWith("o1");
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.status_changed", {
      orderId: "o1",
      merchantId: "m1",
      storeId: "s1",
      status: "canceled",
    });
    expect(orderEvents.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m1", status: "canceled" }),
    );
    expect(push.sendToUser).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        title: "Itens cancelados",
        body: expect.stringContaining("Loja 1"),
      }),
    );
  });

  it("grupo removido (cascade) → no-op", async () => {
    const { svc, tracking, integration, push } = makeHandlers({ group: null });
    await svc.notificar(PAYLOAD);
    expect(tracking.emit).not.toHaveBeenCalled();
    expect(integration.emit).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it("falha do webhook propaga p/ retry isolado", async () => {
    const { svc, integration } = makeHandlers();
    integration.emit.mockRejectedValue(new Error("webhook fora"));
    await expect(svc.notificar(PAYLOAD)).rejects.toThrow("webhook fora");
  });
});
