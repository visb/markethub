import { DeliveryFailedHandlers } from "./delivery-failed.handlers";

/**
 * Story 61: side-effect do `delivery.failed` — push ao cliente ("problema na sua
 * entrega…") + realtime ao painel merchant (mesmo canal do som/badge da story
 * 54). Não transiciona o grupo (painéis derivam a Delivery). Idempotente sob
 * reentrega (relê o estado atual e reemite; grupo removido → no-op).
 */

const PAYLOAD = {
  orderId: "o1",
  groupId: "g1",
  deliveryId: "d1",
  reason: "customer_absent" as const,
};

const GROUP = {
  orderId: "o1",
  merchantId: "m1",
  storeId: "s1",
  status: "on_the_way",
  order: { userId: "u1" },
};

function makeHandlers(opts: { group?: Record<string, unknown> | null } = {}) {
  const groupFindUnique = jest.fn().mockResolvedValue("group" in opts ? opts.group : GROUP);
  const prisma = { orderGroup: { findUnique: groupFindUnique } } as never;
  const integration = { emit: jest.fn().mockResolvedValue(undefined) };
  const orderEvents = { statusChanged: jest.fn() };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const svc = new DeliveryFailedHandlers(
    prisma,
    integration as never,
    orderEvents as never,
    push as never,
  );
  return { svc, groupFindUnique, integration, orderEvents, push };
}

describe("DeliveryFailedHandlers.notificar", () => {
  it("realtime ao merchant (status atual do grupo) + push ao cliente com o motivo", async () => {
    const { svc, integration, orderEvents, push } = makeHandlers();
    await svc.notificar(PAYLOAD);
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.status_changed", {
      orderId: "o1",
      merchantId: "m1",
      storeId: "s1",
      status: "on_the_way",
    });
    expect(orderEvents.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m1", storeId: "s1", status: "on_the_way" }),
    );
    expect(push.sendToUser).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        title: "Problema na entrega",
        body: expect.stringContaining("cliente ausente"),
      }),
    );
  });

  it("mapeia cada motivo para um texto legível no push", async () => {
    for (const [reason, fragment] of [
      ["wrong_address", "endereço"],
      ["refused", "recusado"],
      ["other", "imprevisto"],
    ] as const) {
      const { svc, push } = makeHandlers();
      await svc.notificar({ ...PAYLOAD, reason });
      expect(push.sendToUser).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ body: expect.stringContaining(fragment) }),
      );
    }
  });

  it("grupo removido (cascade) → no-op (idempotência de reentrega)", async () => {
    const { svc, integration, orderEvents, push } = makeHandlers({ group: null });
    await svc.notificar(PAYLOAD);
    expect(integration.emit).not.toHaveBeenCalled();
    expect(orderEvents.statusChanged).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it("falha do webhook propaga p/ retry isolado da fila", async () => {
    const { svc, integration } = makeHandlers();
    integration.emit.mockRejectedValue(new Error("webhook fora"));
    await expect(svc.notificar(PAYLOAD)).rejects.toThrow("webhook fora");
  });
});
