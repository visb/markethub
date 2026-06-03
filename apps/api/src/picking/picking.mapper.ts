import type {
  FulfillmentType,
  PickItem,
  PickTask,
  OrderItem,
  Substitution,
} from "@prisma/client";

// Shape do retorno da API de picking. Espelha PickTaskDTO de @markethub/types
// (não importado aqui p/ não acoplar o build do api ao pacote de tipos).

type PickItemWithRels = PickItem & {
  orderItem: OrderItem;
  substitution: Substitution | null;
};

type PickTaskWithRels = PickTask & {
  items: PickItemWithRels[];
  orderGroup: {
    fulfillment: FulfillmentType;
    pickupCode: string | null;
    order: { scheduledFrom: Date | null };
  };
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

export function toPickItemDto(pi: PickItemWithRels) {
  const oi = pi.orderItem;
  return {
    id: pi.id,
    orderItemId: pi.orderItemId,
    nameSnapshot: oi.nameSnapshot,
    saleType: oi.saleType,
    status: pi.status,
    quantity: oi.quantity,
    weightGrams: oi.weightGrams ?? undefined,
    quantityPicked: pi.quantityPicked ?? undefined,
    weightGramsPicked: pi.weightGramsPicked ?? undefined,
    refusalReason: pi.refusalReason ?? undefined,
    substitution: pi.substitution
      ? {
          id: pi.substitution.id,
          substituteOfferId: pi.substitution.substituteOfferId ?? undefined,
          substituteProductId: pi.substitution.substituteProductId ?? undefined,
          nameSnapshot: pi.substitution.nameSnapshot,
          unitPriceCents: pi.substitution.unitPriceCents,
          priceDiffCents: pi.substitution.priceDiffCents,
          approvalStatus: pi.substitution.approvalStatus,
          resolvedAt: iso(pi.substitution.resolvedAt),
        }
      : undefined,
  };
}

export function toPickTaskDto(task: PickTaskWithRels) {
  return {
    id: task.id,
    orderGroupId: task.orderGroupId,
    storeId: task.storeId,
    pickerId: task.pickerId ?? undefined,
    status: task.status,
    assignedAt: iso(task.assignedAt),
    startedAt: iso(task.startedAt),
    packedAt: iso(task.packedAt),
    readyAt: iso(task.readyAt),
    createdAt: task.createdAt.toISOString(),
    fulfillment: task.orderGroup.fulfillment,
    pickupCode: task.orderGroup.pickupCode ?? undefined,
    items: task.items.map(toPickItemDto),
  };
}

export const PICK_TASK_INCLUDE = {
  items: { include: { orderItem: true, substitution: true } },
  orderGroup: {
    select: {
      fulfillment: true,
      pickupCode: true,
      order: { select: { scheduledFrom: true } },
    },
  },
} as const;
