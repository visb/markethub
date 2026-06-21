import { OrderTrackingService } from "./order-tracking.service";

/**
 * Story 01: recomputeAndEmit é o ponto compartilhado da agregação do Order.status
 * (etapa menos avançada entre os grupos) + emit do snapshot. Chamado por
 * HandoffService E PickingSessionService — testado aqui uma vez para garantir o
 * mesmo critério nos dois chamadores. build/emit dependem do gateway, mockado.
 */

function makeTracking(opts: {
  orderId: string;
  groupStatuses: string[];
}) {
  const orderUpdate = jest.fn().mockResolvedValue({});
  const emitToOrder = jest.fn();
  const prisma = {
    orderGroup: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ orderId: opts.orderId }),
      findMany: jest.fn().mockResolvedValue(opts.groupStatuses.map((status) => ({ status }))),
    },
    order: {
      update: orderUpdate,
      // usado por build() dentro de emit()
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: opts.orderId,
        status: "picking",
        deliveryCode: null,
        updatedAt: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
        scheduledFrom: null,
        scheduledTo: null,
        totalCents: 0,
        addressSnapshot: null,
        groups: [],
      }),
    },
  } as never;
  const gateway = { emitToOrder } as never;
  const svc = new OrderTrackingService(prisma, gateway);
  return { svc, orderUpdate, emitToOrder };
}

describe("OrderTrackingService.recomputeAndEmit — agregação compartilhada", () => {
  it("um grupo em picking → Order.status = picking + emite snapshot", async () => {
    const { svc, orderUpdate, emitToOrder } = makeTracking({
      orderId: "o1",
      groupStatuses: ["picking"],
    });
    await svc.recomputeAndEmit("g1");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "picking" } });
    expect(emitToOrder).toHaveBeenCalledWith("o1", "order.updated", expect.any(Object));
  });

  it("multi-loja: um grupo ainda 'preparing' mantém o pedido em preparing", async () => {
    const { svc, orderUpdate } = makeTracking({
      orderId: "o1",
      groupStatuses: ["picking", "preparing"],
    });
    await svc.recomputeAndEmit("g1");
    // etapa menos avançada entre os grupos
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "preparing" } });
  });

  it("multi-loja: todos os grupos em picking → pedido vira picking", async () => {
    const { svc, orderUpdate } = makeTracking({
      orderId: "o1",
      groupStatuses: ["picking", "picking"],
    });
    await svc.recomputeAndEmit("g1");
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "picking" } });
  });

  it("ignora grupos cancelados ao agregar", async () => {
    const { svc, orderUpdate } = makeTracking({
      orderId: "o1",
      groupStatuses: ["canceled", "ready_for_pickup"],
    });
    await svc.recomputeAndEmit("g1");
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { status: "ready_for_pickup" },
    });
  });

  it("todos cancelados: não atualiza nem emite (sem etapa válida)", async () => {
    const { svc, orderUpdate, emitToOrder } = makeTracking({
      orderId: "o1",
      groupStatuses: ["canceled"],
    });
    await svc.recomputeAndEmit("g1");
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(emitToOrder).not.toHaveBeenCalled();
  });
});

describe("OrderTrackingService.emitForGroup — best-effort", () => {
  it("não relança quando o build falha", async () => {
    const prisma = {
      orderGroup: {
        findUniqueOrThrow: jest.fn().mockRejectedValue(new Error("boom")),
      },
    } as never;
    const gateway = { emitToOrder: jest.fn() } as never;
    const svc = new OrderTrackingService(prisma, gateway);
    await expect(svc.emitForGroup("g1")).resolves.toBeUndefined();
  });
});
