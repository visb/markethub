import type { DeliveryStatus, TipStatus } from "@prisma/client";

/**
 * Include p/ montar um item do histórico de entregas do entregador (story 60):
 * loja, endereço-snapshot do pedido e a gorjeta do pedido (com o driver dono,
 * p/ só anexar quando é deste entregador).
 */
export const HISTORY_INCLUDE = {
  orderGroup: {
    select: {
      orderId: true,
      store: { select: { name: true } },
      order: {
        select: {
          addressSnapshot: true,
          tip: { select: { amountCents: true, status: true, driverId: true } },
        },
      },
    },
  },
} as const;

type AddressLike = { district?: string | null; city?: string | null };

/** Bairro/cidade do destino a partir do snapshot do endereço. */
function destinationArea(addr: AddressLike | null | undefined): string | undefined {
  if (!addr) return undefined;
  const parts = [addr.district, addr.city].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

// Shape mínimo retornado pelo HISTORY_INCLUDE.
type DeliveryHistoryRow = {
  id: string;
  status: DeliveryStatus;
  deliveredAt: Date | null;
  updatedAt: Date;
  orderGroup: {
    orderId: string;
    store: { name: string } | null;
    order: {
      addressSnapshot: unknown;
      tip: { amountCents: number; status: TipStatus; driverId: string } | null;
    } | null;
  };
};

export function toHistoryItem(d: DeliveryHistoryRow, userId: string) {
  const addr = (d.orderGroup.order?.addressSnapshot ?? null) as AddressLike | null;
  const tip = d.orderGroup.order?.tip ?? null;
  // Só anexa a gorjeta se ela for deste entregador (defensivo p/ pedido multi-loja).
  const ownTip = tip && tip.driverId === userId ? { amountCents: tip.amountCents, status: tip.status } : undefined;
  return {
    id: d.id,
    orderId: d.orderGroup.orderId,
    status: d.status as "delivered" | "canceled",
    storeName: d.orderGroup.store?.name ?? "",
    destinationArea: destinationArea(addr),
    // entregue: deliveredAt; cancelada (sem deliveredAt): quando foi cancelada (updatedAt).
    date: (d.deliveredAt ?? d.updatedAt).toISOString(),
    tip: ownTip,
  };
}
