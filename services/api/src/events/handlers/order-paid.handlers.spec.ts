import { OrderPaidHandlers } from "./order-paid.handlers";

/**
 * Story 45: side-effects do `order.paid` como handlers independentes — cada um
 * relê o estado por orderId (payload mínimo) e é idempotente sob reentrega por
 * construção (guards de domínio), além da trava ProcessedEvent. Falha de um não
 * afeta os outros: são filas/execuções separadas.
 */

const GROUPS = [
  { id: "g1", merchantId: "m1", storeId: "s1", status: "preparing" },
  { id: "g2", merchantId: "m2", storeId: "s2", status: "preparing" },
];

function makeHandlers(groups: typeof GROUPS = GROUPS) {
  const findMany = jest.fn().mockResolvedValue(groups);
  const prisma = { orderGroup: { findMany } } as never;
  const erp = { pushOrderGroup: jest.fn().mockResolvedValue(undefined) };
  const picking = { generateForOrder: jest.fn().mockResolvedValue(undefined) };
  const tracking = { emit: jest.fn().mockResolvedValue(undefined) };
  const integration = { emit: jest.fn().mockResolvedValue(undefined) };
  const orderEvents = { statusChanged: jest.fn() };
  const svc = new OrderPaidHandlers(
    prisma,
    erp as never,
    picking as never,
    tracking as never,
    integration as never,
    orderEvents as never,
  );
  return { svc, findMany, erp, picking, tracking, integration, orderEvents };
}

const payload = { orderId: "order1" };

describe("OrderPaidHandlers.pushErp", () => {
  it("empurra CADA grupo do pedido ao ERP", async () => {
    const { svc, findMany, erp } = makeHandlers();
    await svc.pushErp(payload);
    expect(findMany).toHaveBeenCalledWith({ where: { orderId: "order1" }, select: { id: true } });
    expect(erp.pushOrderGroup).toHaveBeenCalledTimes(2);
    expect(erp.pushOrderGroup).toHaveBeenNthCalledWith(1, "g1");
    expect(erp.pushOrderGroup).toHaveBeenNthCalledWith(2, "g2");
  });

  it("pedido sem grupos: no-op (reentrega após cascade delete não explode)", async () => {
    const { svc, erp } = makeHandlers([]);
    await svc.pushErp(payload);
    expect(erp.pushOrderGroup).not.toHaveBeenCalled();
  });

  it("falha do ERP propaga (BullMQ retenta só este handler)", async () => {
    const { svc, erp } = makeHandlers();
    erp.pushOrderGroup.mockRejectedValue(new Error("erp fora"));
    await expect(svc.pushErp(payload)).rejects.toThrow("erp fora");
  });
});

describe("OrderPaidHandlers.gerarPicking", () => {
  it("gera as tarefas de separação do pedido", async () => {
    const { svc, picking } = makeHandlers();
    await svc.gerarPicking(payload);
    expect(picking.generateForOrder).toHaveBeenCalledWith("order1");
  });

  it("falha propaga p/ retry isolado", async () => {
    const { svc, picking } = makeHandlers();
    picking.generateForOrder.mockRejectedValue(new Error("db"));
    await expect(svc.gerarPicking(payload)).rejects.toThrow("db");
  });
});

describe("OrderPaidHandlers.notificar", () => {
  it("emite tracking do pedido + webhook e socket por grupo com o status ATUAL", async () => {
    const { svc, tracking, integration, orderEvents } = makeHandlers();
    await svc.notificar(payload);
    expect(tracking.emit).toHaveBeenCalledWith("order1");
    expect(integration.emit).toHaveBeenCalledTimes(2);
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.status_changed", {
      orderId: "order1",
      merchantId: "m1",
      storeId: "s1",
      status: "preparing",
    });
    expect(orderEvents.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m2", storeId: "s2", status: "preparing" }),
    );
  });

  it("relê o estado: reentrega tardia emite o status corrente do grupo (não 'preparing' cravado)", async () => {
    const { svc, integration } = makeHandlers([
      { id: "g1", merchantId: "m1", storeId: "s1", status: "canceled" },
    ]);
    await svc.notificar(payload);
    expect(integration.emit).toHaveBeenCalledWith(
      "m1",
      "order.status_changed",
      expect.objectContaining({ status: "canceled" }),
    );
  });
});
