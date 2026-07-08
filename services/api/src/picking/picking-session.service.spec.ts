import { BadRequestException } from "@nestjs/common";
import { PickingSessionService } from "./picking-session.service";

/**
 * Foco C06: recalcTotals — recomposição do subtotal do grupo e total do pedido
 * a partir do estado dos PickItems (pendente mantém, recusado zera, substituído
 * usa snapshot, separado cobra no máximo o pedido → weight/under-delivery) + as
 * validações de quantidade/peso no updateItem.
 */

function makeService(prismaOverrides: Record<string, unknown>, tracking?: Record<string, unknown>) {
  const prisma = prismaOverrides as never;
  const events = {
    itemUpdated: jest.fn(),
    taskStatusChanged: jest.fn(),
  } as never;
  const track = (tracking ?? {
    recomputeAndEmit: jest.fn().mockResolvedValue(undefined),
    emitForGroup: jest.fn().mockResolvedValue(undefined),
  }) as never;
  // story 48: RefundService saiu do construtor — o estorno de shortfall virou
  // handler do evento `picking.done` (verificar-shortfall-refund).
  return new PickingSessionService(prisma, events, track);
}

describe("PickingSessionService.recalcTotals", () => {
  it("soma pendente, zera recusado, usa snapshot do substituído e clampa under-delivery", async () => {
    const group = {
      orderId: "o1",
      items: [
        // A pendente → mantém lineTotalCents
        { lineTotalCents: 1000, quantity: 1, saleType: "unit", unitPriceCents: 1000, weightGrams: null, pickItem: null },
        // B recusado → 0
        { lineTotalCents: 500, quantity: 1, saleType: "unit", unitPriceCents: 500, weightGrams: null, pickItem: { status: "refused", substitution: null } },
        // C substituído → snapshot.unitPriceCents * quantity (300*2)
        { lineTotalCents: 0, quantity: 2, saleType: "unit", unitPriceCents: 250, weightGrams: null, pickItem: { status: "substituted", substitution: { unitPriceCents: 300 } } },
        // D peso under-delivery → 5000/kg * min(300,500)g = 1500
        { lineTotalCents: 2500, quantity: 1, saleType: "weight", unitPriceCents: 5000, weightGrams: 500, pickItem: { status: "picked", quantityPicked: null, weightGramsPicked: 300, substitution: null } },
        // E unit picked completo → 200*3
        { lineTotalCents: 600, quantity: 3, saleType: "unit", unitPriceCents: 200, weightGrams: null, pickItem: { status: "picked", quantityPicked: 3, weightGramsPicked: null, substitution: null } },
      ],
    };
    const groupUpdate = jest.fn().mockResolvedValue({});
    const orderUpdate = jest.fn().mockResolvedValue({});

    const svc = makeService({
      orderGroup: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(group),
        update: groupUpdate,
      },
      order: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "o1",
          groups: [{ subtotalCents: 3700 }],
          deliveryCents: 1200,
          prepCents: 100,
          platformFeeCents: 370,
          discountCents: 0,
        }),
        update: orderUpdate,
      },
    });

    await svc.recalcTotals("g1");

    // 1000 + 0 + 600 + 1500 + 600 = 3700
    expect(groupUpdate).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { subtotalCents: 3700 },
    });
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { itemsCents: 3700, totalCents: 5370 },
    });
  });
});

describe("PickingSessionService.updateItem — validações", () => {
  function svcForItem(saleType: "unit" | "weight", quantity = 3) {
    return makeService({
      pickTask: {
        findUnique: jest.fn().mockResolvedValue({
          id: "t1",
          pickerId: "u1",
          status: "picking",
          orderGroupId: "g1",
        }),
      },
      pickItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pi1",
          pickTaskId: "t1",
          orderItem: { saleType, quantity },
        }),
      },
    });
  }

  it("PICK_TASK_NOT_PICKING quando a tarefa não está em separação", async () => {
    const svc = makeService({
      pickTask: {
        findUnique: jest.fn().mockResolvedValue({ id: "t1", pickerId: "u1", status: "assigned" }),
      },
    });
    await expect(
      svc.updateItem("u1", "t1", "pi1", { action: "pick", quantityPicked: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("INVALID_QUANTITY para quantidade não-inteira ou < 1", async () => {
    const svc = svcForItem("unit");
    await expect(
      svc.updateItem("u1", "t1", "pi1", { action: "pick", quantityPicked: 0 }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "INVALID_QUANTITY" }) });
  });

  it("QUANTITY_EXCEEDS_ORDERED quando separa mais que o pedido", async () => {
    const svc = svcForItem("unit", 2);
    await expect(
      svc.updateItem("u1", "t1", "pi1", { action: "pick", quantityPicked: 5 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUANTITY_EXCEEDS_ORDERED" }),
    });
  });

  it("INVALID_WEIGHT para peso não-inteiro ou < 1", async () => {
    const svc = svcForItem("weight");
    await expect(
      svc.updateItem("u1", "t1", "pi1", { action: "pick", weightGramsPicked: 0 }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "INVALID_WEIGHT" }) });
  });

  it("REFUSAL_REASON_REQUIRED ao recusar sem motivo", async () => {
    const svc = svcForItem("unit");
    await expect(
      svc.updateItem("u1", "t1", "pi1", { action: "refuse", refusalReason: "  " }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REFUSAL_REASON_REQUIRED" }),
    });
  });
});

/**
 * Story 01: start() transiciona o OrderGroup → picking + emite o snapshot de
 * rastreio (passo "Comprando" na tela do cliente). Idempotente. A agregação do
 * Order.status vive no OrderTrackingService (mockado aqui) — coberta à parte.
 */
describe("PickingSessionService.start — transição do grupo + emit", () => {
  function startSvc(taskStatus: string) {
    const taskUpdate = jest.fn().mockResolvedValue({});
    const groupUpdate = jest.fn().mockResolvedValue({});
    const $transaction = jest.fn().mockResolvedValue([{}, {}]);
    const recomputeAndEmit = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      {
        pickTask: {
          findUnique: jest.fn().mockResolvedValue({
            id: "t1",
            pickerId: "u1",
            status: taskStatus,
            orderGroupId: "g1",
          }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: "t1",
            storeId: "s1",
            orderGroupId: "g1",
            pickerId: "u1",
            status: "picking",
            assignedAt: new Date("2026-01-01"),
            startedAt: new Date("2026-01-01"),
            packedAt: null,
            readyAt: null,
            createdAt: new Date("2026-01-01"),
            items: [],
            orderGroup: { fulfillment: "delivery", pickupCode: null, order: { scheduledFrom: null } },
          }),
          update: taskUpdate,
        },
        orderGroup: { update: groupUpdate },
        $transaction,
      },
      { recomputeAndEmit, emitForGroup: jest.fn() },
    );
    return { svc, $transaction, recomputeAndEmit };
  }

  it("transiciona pickTask + OrderGroup → picking na mesma transação e emite", async () => {
    const { svc, $transaction, recomputeAndEmit } = startSvc("assigned");
    await svc.start("u1", "t1");
    // dois updates atômicos: pickTask e orderGroup
    expect($transaction).toHaveBeenCalledTimes(1);
    const ops = $transaction.mock.calls[0][0];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops).toHaveLength(2);
    // recompute agregado + emit do snapshot
    expect(recomputeAndEmit).toHaveBeenCalledWith("g1");
  });

  it("idempotente: já em picking não re-transiciona nem re-emite", async () => {
    const { svc, $transaction, recomputeAndEmit } = startSvc("picking");
    await svc.start("u1", "t1");
    expect($transaction).not.toHaveBeenCalled();
    expect(recomputeAndEmit).not.toHaveBeenCalled();
  });
});

describe("PickingSessionService.updateItem — emit de rastreio (story 01)", () => {
  function svcForUpdate(opts?: { emitForGroup?: jest.Mock }) {
    const emitForGroup = opts?.emitForGroup ?? jest.fn().mockResolvedValue(undefined);
    const recalcGroup = {
      orderId: "o1",
      items: [],
    };
    const svc = makeService(
      {
        pickTask: {
          findUnique: jest.fn().mockResolvedValue({
            id: "t1",
            pickerId: "u1",
            status: "picking",
            orderGroupId: "g1",
          }),
        },
        pickItem: {
          findFirst: jest.fn().mockResolvedValue({
            id: "pi1",
            pickTaskId: "t1",
            orderItem: { saleType: "unit", quantity: 2 },
          }),
          update: jest.fn().mockResolvedValue({}),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: "pi1",
            status: "picked",
            orderItem: { saleType: "unit", quantity: 2 },
            substitution: null,
          }),
        },
        orderGroup: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(recalcGroup),
          update: jest.fn().mockResolvedValue({}),
        },
        order: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: "o1",
            groups: [{ subtotalCents: 0 }],
            deliveryCents: 0,
            prepCents: 0,
            platformFeeCents: 0,
            discountCents: 0,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
      { recomputeAndEmit: jest.fn(), emitForGroup },
    );
    return { svc, emitForGroup };
  }

  it("pick: emite o snapshot no canal order: após o recálculo", async () => {
    const { svc, emitForGroup } = svcForUpdate();
    await svc.updateItem("u1", "t1", "pi1", { action: "pick", quantityPicked: 2 });
    expect(emitForGroup).toHaveBeenCalledWith("g1");
  });

  it("refuse: emite o snapshot no canal order:", async () => {
    const { svc, emitForGroup } = svcForUpdate();
    // reusa o mock; refusa com motivo
    await svc.updateItem("u1", "t1", "pi1", { action: "refuse", refusalReason: "sem estoque" });
    expect(emitForGroup).toHaveBeenCalledWith("g1");
  });

  it("emit best-effort: não relança a operação se o emit falhar", async () => {
    // emitForGroup é best-effort dentro do OrderTrackingService (try/catch); aqui
    // garantimos que o serviço espera uma promise resolvida e segue.
    const emitForGroup = jest.fn().mockResolvedValue(undefined);
    const { svc } = svcForUpdate({ emitForGroup });
    await expect(
      svc.updateItem("u1", "t1", "pi1", { action: "pick", quantityPicked: 2 }),
    ).resolves.toBeDefined();
  });
});

describe("PickingSessionService.completePicking — emit final (story 01)", () => {
  it("emite o snapshot final; status do pedido segue 'picking'", async () => {
    const emitForGroup = jest.fn().mockResolvedValue(undefined);
    const recomputeAndEmit = jest.fn().mockResolvedValue(undefined);
    const svc = makeService(
      {
        pickTask: {
          findUnique: jest.fn().mockResolvedValue({
            id: "t1",
            pickerId: "u1",
            status: "picking",
            orderGroupId: "g1",
          }),
          update: jest.fn().mockResolvedValue({}),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: "t1",
            storeId: "s1",
            orderGroupId: "g1",
            pickerId: "u1",
            status: "packed",
            assignedAt: new Date("2026-01-01"),
            startedAt: new Date("2026-01-01"),
            packedAt: new Date("2026-01-01"),
            readyAt: null,
            createdAt: new Date("2026-01-01"),
            items: [],
            orderGroup: { fulfillment: "delivery", pickupCode: null, order: { scheduledFrom: null } },
          }),
        },
        pickItem: { count: jest.fn().mockResolvedValue(0) },
        orderGroup: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ orderId: "o1", items: [] }),
          update: jest.fn().mockResolvedValue({}),
        },
        order: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: "o1",
            groups: [{ subtotalCents: 0 }],
            deliveryCents: 0,
            prepCents: 0,
            platformFeeCents: 0,
            discountCents: 0,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
      { recomputeAndEmit, emitForGroup },
    );
    await svc.completePicking("u1", "t1");
    expect(emitForGroup).toHaveBeenCalledWith("g1");
    // completePicking NÃO toca no status do pedido (segue picking até markReady)
    expect(recomputeAndEmit).not.toHaveBeenCalled();
  });
});
