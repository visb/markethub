import type { DeliveryStatus, TipStatus } from "@prisma/client";

/**
 * Include p/ montar um item do histórico de entregas do entregador (story 60):
 * loja, endereço-snapshot do pedido e a gorjeta do pedido. Desde a story 77 a
 * gorjeta do entregador é um TipItem (target=driver); anexamos os itens driver e
 * o mapper escolhe o deste entregador (valor do item + status agregado do Tip).
 */
export const HISTORY_INCLUDE = {
  orderGroup: {
    select: {
      orderId: true,
      store: { select: { name: true } },
      order: {
        select: {
          addressSnapshot: true,
          tip: {
            select: {
              status: true,
              items: {
                where: { target: "driver" as const },
                select: { amountCents: true, targetDriverId: true },
              },
            },
          },
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
      tip: {
        status: TipStatus;
        items: { amountCents: number; targetDriverId: string | null }[];
      } | null;
    } | null;
  };
};

export function toHistoryItem(d: DeliveryHistoryRow, userId: string) {
  const addr = (d.orderGroup.order?.addressSnapshot ?? null) as AddressLike | null;
  const tip = d.orderGroup.order?.tip ?? null;
  // Só anexa a gorjeta se houver um item driver deste entregador (defensivo p/ multi-loja).
  const ownItem = tip?.items.find((i) => i.targetDriverId === userId);
  const ownTip = ownItem ? { amountCents: ownItem.amountCents, status: tip!.status } : undefined;
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
