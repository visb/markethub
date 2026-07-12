import type { OrderItem, PickItem, Substitution } from "@prisma/client";
import { toPickItemDto, toPickTaskDto } from "./picking.mapper";

/**
 * Story 63: o DTO de cada item da task expõe o `gtin` (snapshot do pedido) p/ o
 * scanner do separador casar a bipagem com o item — sem endpoint/join novos.
 */

function mkOrderItem(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "oi1",
    groupId: "g1",
    productId: "p1",
    offerId: "of1",
    nameSnapshot: "Arroz 5kg",
    gtinSnapshot: "7891234567890",
    saleType: "unit",
    unitPriceCents: 2599,
    quantity: 2,
    weightGrams: null,
    lineTotalCents: 5198,
    ...over,
  } as OrderItem;
}

function mkPickItem(oi: OrderItem, over: Partial<PickItem> = {}): PickItem & {
  orderItem: OrderItem;
  substitution: Substitution | null;
} {
  return {
    id: "pi1",
    pickTaskId: "t1",
    orderItemId: oi.id,
    status: "pending",
    quantityPicked: null,
    weightGramsPicked: null,
    refusalReason: null,
    pickedById: null,
    pickedAt: null,
    orderItem: oi,
    substitution: null,
    ...over,
  } as PickItem & { orderItem: OrderItem; substitution: Substitution | null };
}

describe("toPickItemDto — gtin (story 63)", () => {
  it("expõe o gtinSnapshot do item como gtin", () => {
    const dto = toPickItemDto(mkPickItem(mkOrderItem({ gtinSnapshot: "7890000000017" })));
    expect(dto.gtin).toBe("7890000000017");
  });

  it("item sem gtin no snapshot → gtin undefined (segue no fluxo manual)", () => {
    const dto = toPickItemDto(mkPickItem(mkOrderItem({ gtinSnapshot: null })));
    expect(dto.gtin).toBeUndefined();
  });
});

describe("toPickTaskDto — gtin nos itens (story 63)", () => {
  it("propaga o gtin de cada item da task", () => {
    const oi = mkOrderItem({ gtinSnapshot: "7891111111117" });
    const task = {
      id: "t1",
      orderGroupId: "og1",
      storeId: "s1",
      pickerId: "u1",
      status: "picking",
      assignedAt: null,
      startedAt: new Date("2026-07-11T10:00:00Z"),
      packedAt: null,
      readyAt: null,
      createdAt: new Date("2026-07-11T09:00:00Z"),
      items: [mkPickItem(oi)],
      orderGroup: {
        fulfillment: "delivery" as const,
        pickupCode: null,
        order: { scheduledFrom: null },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dto = toPickTaskDto(task as any);
    expect(dto.items[0]!.gtin).toBe("7891111111117");
  });
});
