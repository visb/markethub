import { HandoffService } from "./handoff.service";

/**
 * Story 01 (regressão): markReady continua levando OrderGroup → ready_for_pickup
 * + recompute/emit, agora pelo método compartilhado tracking.recomputeAndEmit
 * (sem duplicar a agregação no HandoffService). Garante que a extração não
 * quebrou o handoff.
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

function makeService(taskStatus: string) {
  const groupUpdate = jest.fn().mockResolvedValue({});
  const taskUpdate = jest.fn().mockResolvedValue({});
  const $transaction = jest.fn().mockResolvedValue([{}, {}]);
  const recomputeAndEmit = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    pickTask: {
      findUnique: jest.fn().mockResolvedValue({
        id: "t1",
        orderGroupId: "g1",
        storeId: "s1",
        pickerId: "u1",
        status: taskStatus,
        orderGroup: { pickupCode: "1234", fulfillment: "pickup", storeId: "s1" },
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(DETAIL_TASK),
      update: taskUpdate,
    },
    orderGroup: {
      update: groupUpdate,
      findUnique: jest.fn().mockResolvedValue({ orderId: "o1", order: { userId: "owner1" } }),
    },
    delivery: { upsert: jest.fn() },
    $transaction,
  } as never;
  const events = { readyForPickup: jest.fn() } as never;
  const tracking = { recomputeAndEmit } as never;
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) } as never;
  const emit = jest.fn().mockResolvedValue(undefined);
  const integration = { emit } as never;
  const svc = new HandoffService(prisma, events, tracking, push, integration);
  return { svc, $transaction, recomputeAndEmit, events, emit };
}

describe("HandoffService.markReady — regressão story 01", () => {
  it("packed → ready_for_pickup + recompute/emit compartilhado, sem duplicar agregação", async () => {
    const { svc, $transaction, recomputeAndEmit, events } = makeService("packed");
    const dto = await svc.markReady("u1", "t1");
    // transação muda task + grupo (pickup não cria delivery)
    expect($transaction).toHaveBeenCalledTimes(1);
    // delega a agregação ao ponto compartilhado (não recomputa localmente)
    expect(recomputeAndEmit).toHaveBeenCalledWith("g1");
    expect((events as { readyForPickup: jest.Mock }).readyForPickup).toHaveBeenCalled();
    expect(dto.status).toBe("ready_for_pickup");
  });

  it("idempotente: já ready_for_pickup não re-transiciona", async () => {
    const { svc, $transaction, recomputeAndEmit } = makeService("ready_for_pickup");
    await svc.markReady("u1", "t1");
    expect($transaction).not.toHaveBeenCalled();
    expect(recomputeAndEmit).not.toHaveBeenCalled();
  });
});
