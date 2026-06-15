import { BadRequestException } from "@nestjs/common";
import { PickingSessionService } from "./picking-session.service";

/**
 * Foco C06: recalcTotals — recomposição do subtotal do grupo e total do pedido
 * a partir do estado dos PickItems (pendente mantém, recusado zera, substituído
 * usa snapshot, separado cobra no máximo o pedido → weight/under-delivery) + as
 * validações de quantidade/peso no updateItem.
 */

function makeService(prismaOverrides: Record<string, unknown>) {
  const prisma = prismaOverrides as never;
  const events = {
    itemUpdated: jest.fn(),
    taskStatusChanged: jest.fn(),
  } as never;
  const refunds = { maybeIssueRefundForOrder: jest.fn().mockResolvedValue(undefined) } as never;
  return new PickingSessionService(prisma, events, refunds);
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
