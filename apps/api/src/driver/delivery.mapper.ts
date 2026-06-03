import type { DeliveryStatus } from "@prisma/client";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

/** Include p/ montar o DeliveryDTO (grupo, loja, pedido, cliente, entregador). */
export const DELIVERY_INCLUDE = {
  orderGroup: {
    select: {
      id: true,
      orderId: true,
      store: { select: { id: true, name: true } },
      _count: { select: { items: true } },
      order: {
        select: {
          deliveryCode: true,
          addressSnapshot: true,
          user: { select: { name: true } },
        },
      },
    },
  },
  driver: { select: { id: true, name: true } },
} as const;

type AddressLike = {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

function addressLine(a: AddressLike | null | undefined): string | undefined {
  if (!a) return undefined;
  const parts = [a.street, a.number, a.district, a.city, a.state].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

// Shape mínimo retornado pelo DELIVERY_INCLUDE.
type DeliveryWithRels = {
  id: string;
  status: DeliveryStatus;
  driverId: string | null;
  assignedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  storeId: string;
  orderGroup: {
    id: string;
    orderId: string;
    store: { id: string; name: string } | null;
    _count: { items: number };
    order: { deliveryCode: string | null; addressSnapshot: unknown; user: { name: string } } | null;
  };
  driver: { id: string; name: string } | null;
};

export function toDeliveryDto(d: DeliveryWithRels) {
  const addr = (d.orderGroup.order?.addressSnapshot ?? null) as AddressLike | null;
  return {
    id: d.id,
    orderGroupId: d.orderGroup.id,
    orderId: d.orderGroup.orderId,
    status: d.status,
    storeId: d.orderGroup.store?.id ?? d.storeId,
    storeName: d.orderGroup.store?.name ?? "",
    customerName: d.orderGroup.order?.user.name ?? "",
    address: addressLine(addr),
    itemCount: d.orderGroup._count.items,
    driverId: d.driver?.id,
    driverName: d.driver?.name,
    assignedAt: iso(d.assignedAt),
    pickedUpAt: iso(d.pickedUpAt),
    deliveredAt: iso(d.deliveredAt),
    createdAt: iso(d.createdAt),
  };
}
