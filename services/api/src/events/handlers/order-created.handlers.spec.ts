import { OrderCreatedHandlers } from "./order-created.handlers";

/**
 * Story 46: side-effects do `order.created` como handlers independentes — cada
 * um relê o estado por orderId (payload mínimo) e é idempotente sob reentrega
 * por construção (PixChargeService reaproveita cobrança pendente; notificar
 * reemite o status atual, inócuo), além da trava ProcessedEvent. Falha de um
 * não afeta o outro: filas/execuções separadas (retry isolado).
 */

const GROUPS = [
  { merchantId: "m1", storeId: "s1", status: "created" },
  { merchantId: "m2", storeId: "s2", status: "created" },
];

function makeHandlers(groups: typeof GROUPS = GROUPS) {
  const findMany = jest.fn().mockResolvedValue(groups);
  const prisma = { orderGroup: { findMany } } as never;
  const pixCharge = { ensureForOrder: jest.fn().mockResolvedValue({ id: "p1" }) };
  const integration = { emit: jest.fn().mockResolvedValue(undefined) };
  const orderEvents = { created: jest.fn() };
  const svc = new OrderCreatedHandlers(
    prisma,
    pixCharge as never,
    integration as never,
    orderEvents as never,
  );
  return { svc, findMany, pixCharge, integration, orderEvents };
}

const payload = { orderId: "order1" };

describe("OrderCreatedHandlers.gerarCobrancaPix", () => {
  it("garante a cobrança PIX via a camada de pagamento (provider atrás de interface)", async () => {
    const { svc, pixCharge } = makeHandlers();
    await svc.gerarCobrancaPix(payload);
    expect(pixCharge.ensureForOrder).toHaveBeenCalledWith("order1");
  });

  it("idempotente sob reentrega: segunda entrega delega de novo e o ensure faz short-circuit", async () => {
    const { svc, pixCharge } = makeHandlers();
    await svc.gerarCobrancaPix(payload);
    pixCharge.ensureForOrder.mockResolvedValue(null); // pedido já pago/cobrança reaproveitada
    await expect(svc.gerarCobrancaPix(payload)).resolves.toBeUndefined();
    expect(pixCharge.ensureForOrder).toHaveBeenCalledTimes(2);
  });

  it("falha do gateway propaga (BullMQ retenta só este handler)", async () => {
    const { svc, pixCharge } = makeHandlers();
    pixCharge.ensureForOrder.mockRejectedValue(new Error("gateway fora"));
    await expect(svc.gerarCobrancaPix(payload)).rejects.toThrow("gateway fora");
  });
});

describe("OrderCreatedHandlers.notificar", () => {
  it("emite webhook order.created + socket à store room por grupo, com o status ATUAL", async () => {
    const { svc, findMany, integration, orderEvents } = makeHandlers();
    await svc.notificar(payload);
    expect(findMany).toHaveBeenCalledWith({
      where: { orderId: "order1" },
      select: { merchantId: true, storeId: true, status: true },
    });
    expect(integration.emit).toHaveBeenCalledTimes(2);
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.created", {
      orderId: "order1",
      merchantId: "m1",
      storeId: "s1",
      status: "created",
    });
    expect(orderEvents.created).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m2", storeId: "s2", status: "created" }),
    );
  });

  it("relê o estado: reentrega tardia emite o status corrente do grupo (não 'created' cravado)", async () => {
    const { svc, integration } = makeHandlers([
      { merchantId: "m1", storeId: "s1", status: "preparing" },
    ]);
    await svc.notificar(payload);
    expect(integration.emit).toHaveBeenCalledWith(
      "m1",
      "order.created",
      expect.objectContaining({ status: "preparing" }),
    );
  });

  it("pedido sem grupos: no-op (reentrega após cascade delete não explode)", async () => {
    const { svc, integration, orderEvents } = makeHandlers([]);
    await svc.notificar(payload);
    expect(integration.emit).not.toHaveBeenCalled();
    expect(orderEvents.created).not.toHaveBeenCalled();
  });

  it("falha do webhook propaga p/ retry isolado (não afeta gerar-cobranca-pix)", async () => {
    const { svc, integration, pixCharge } = makeHandlers();
    integration.emit.mockRejectedValue(new Error("webhook fora"));
    await expect(svc.notificar(payload)).rejects.toThrow("webhook fora");
    // o outro handler roda em fila própria — nada dele é invocado aqui
    expect(pixCharge.ensureForOrder).not.toHaveBeenCalled();
  });
});
