import { HandoffService } from "./handoff.service";

/**
 * Story 46: markReady leva PickTask/OrderGroup → ready_for_pickup e emite
 * `picking.done` no outbox NA MESMA TX. Criação da Delivery e notificações
 * (tracking/webhook/socket/push) saíram do fluxo inline — viraram handlers do
 * evento (picking-done.handlers). Aqui garantimos a transição, a emissão
 * atômica e a ausência dos side-effects inline.
 */

const DETAIL_TASK = {
  id: "t1",
  orderGroupId: "g1",
  storeId: "s1",
  pickerId: "u1",
  status: "ready_for_pickup",
  assignedAt: new Date("2026-01-01"),
  startedAt: new Date("2026-01-01"),
  packedAt: new Date("2026-01-01"),
  readyAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  items: [],
  orderGroup: { fulfillment: "pickup", pickupCode: "1234", order: { scheduledFrom: null } },
};

function makeService(taskStatus: string, fulfillment: "pickup" | "delivery" = "pickup") {
  const groupUpdate = jest.fn().mockReturnValue({ op: "groupUpdate" });
  const taskUpdate = jest.fn().mockReturnValue({ op: "taskUpdate" });
  const deliveryUpsert = jest.fn().mockReturnValue({ op: "deliveryUpsert" });
  const $transaction = jest.fn().mockResolvedValue([{}, {}, {}]);
  const recomputeAndEmit = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    pickTask: {
      findUnique: jest.fn().mockResolvedValue({
        id: "t1",
        orderGroupId: "g1",
        storeId: "s1",
        pickerId: "u1",
        status: taskStatus,
        orderGroup: { pickupCode: "1234", fulfillment, storeId: "s1" },
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(DETAIL_TASK),
      update: taskUpdate,
    },
    orderGroup: {
      update: groupUpdate,
      findUnique: jest
        .fn()
        .mockResolvedValue({ orderId: "o1", merchantId: "m1", storeId: "s1", order: { userId: "owner1" } }),
    },
    delivery: { upsert: deliveryUpsert },
    $transaction,
  } as never;
  const recompute = { recomputeAndEmit } as never;
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const push = { sendToUser } as never;
  const emit = jest.fn().mockResolvedValue(undefined);
  const integration = { emit } as never;
  const statusChanged = jest.fn();
  const orderEvents = { statusChanged, created: jest.fn() } as never;
  const publish = jest.fn().mockReturnValue({ op: "outboxPublish" });
  const outbox = { publish } as never;
  const svc = new HandoffService(prisma, recompute, push, integration, orderEvents, outbox);
  return {
    svc,
    prisma,
    $transaction,
    recomputeAndEmit,
    deliveryUpsert,
    emit,
    statusChanged,
    sendToUser,
    publish,
  };
}

describe("HandoffService.markReady — story 46 (picking.done no outbox)", () => {
  it("packed → ready_for_pickup e emite picking.done NA MESMA TX", async () => {
    const { svc, $transaction, prisma, publish } = makeService("packed");
    const dto = await svc.markReady("u1", "t1");

    expect($transaction).toHaveBeenCalledTimes(1);
    // a TX contém task.update + group.update + a row do outbox (atômico)
    const ops = $transaction.mock.calls[0]![0] as { op: string }[];
    expect(ops).toEqual(
      expect.arrayContaining([{ op: "taskUpdate" }, { op: "groupUpdate" }, { op: "outboxPublish" }]),
    );
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(prisma, {
      type: "picking.done",
      payload: { orderGroupId: "g1" },
      aggregateId: "g1",
    });
    expect(dto.status).toBe("ready_for_pickup");
  });

  it("não cria mais a Delivery inline (virou handler iniciar-entrega)", async () => {
    const { svc, deliveryUpsert, $transaction } = makeService("packed", "delivery");
    await svc.markReady("u1", "t1");
    expect(deliveryUpsert).not.toHaveBeenCalled();
    const ops = $transaction.mock.calls[0]![0] as { op: string }[];
    expect(ops).not.toEqual(expect.arrayContaining([{ op: "deliveryUpsert" }]));
  });

  it("não notifica mais inline (tracking/webhook/socket/push viraram handler notificar)", async () => {
    const { svc, recomputeAndEmit, emit, statusChanged, sendToUser } = makeService("packed");
    await svc.markReady("u1", "t1");
    expect(recomputeAndEmit).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(statusChanged).not.toHaveBeenCalled();
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it("idempotente: já ready_for_pickup não re-transiciona nem reemite o evento", async () => {
    const { svc, $transaction, publish } = makeService("ready_for_pickup");
    await svc.markReady("u1", "t1");
    expect($transaction).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("status inválido (não packed) → PICK_TASK_NOT_PACKED sem emitir", async () => {
    const { svc, publish } = makeService("picking");
    await expect(svc.markReady("u1", "t1")).rejects.toMatchObject({
      response: { code: "PICK_TASK_NOT_PACKED" },
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("não-dono → NOT_TASK_OWNER", async () => {
    const { svc } = makeService("packed");
    await expect(svc.markReady("intruso", "t1")).rejects.toMatchObject({
      response: { code: "NOT_TASK_OWNER" },
    });
  });
});
