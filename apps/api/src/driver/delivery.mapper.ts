import type { DriverProfile } from "@prisma/client";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

/** Include p/ carregar a rota com paradas, lojas, grupos e pedido (dropoff). */
export const ROUTE_INCLUDE = {
  stops: {
    orderBy: { sequence: "asc" as const },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          street: true,
          number: true,
          district: true,
          city: true,
          state: true,
          latitude: true,
          longitude: true,
        },
      },
      groups: {
        select: {
          id: true,
          orderId: true,
          pickupCode: true,
          _count: { select: { items: true } },
        },
      },
      order: {
        select: {
          id: true,
          addressSnapshot: true,
          user: { select: { name: true } },
        },
      },
    },
  },
} as const;

type AddressLike = {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function addressLine(a: AddressLike | null | undefined): string | undefined {
  if (!a) return undefined;
  const parts = [a.street, a.number, a.district, a.city, a.state].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

export function toDriverProfileDto(p: DriverProfile) {
  return {
    id: p.id,
    vehicleType: p.vehicleType,
    status: p.status,
    currentLat: p.currentLat ?? undefined,
    currentLng: p.currentLng ?? undefined,
    lastSeenAt: iso(p.lastSeenAt),
  };
}

// Shape mínimo retornado pelo ROUTE_INCLUDE.
type StopWithRels = {
  id: string;
  sequence: number;
  type: "pickup" | "dropoff";
  status: "pending" | "arrived" | "done";
  storeId: string | null;
  orderId: string | null;
  arrivedAt: Date | null;
  doneAt: Date | null;
  store: {
    id: string;
    name: string;
    street: string | null;
    number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  groups: { id: string; orderId: string; pickupCode: string | null; _count: { items: number } }[];
  order: { id: string; addressSnapshot: unknown; user: { name: string } } | null;
};

type RouteWithRels = {
  id: string;
  status: string;
  estimatedEarningsCents: number;
  distanceMeters: number;
  offerExpiresAt: Date | null;
  offeredAt: Date | null;
  acceptedAt: Date | null;
  completedAt: Date | null;
  stops: StopWithRels[];
};

export function toRouteStopDto(s: StopWithRels) {
  if (s.type === "pickup") {
    return {
      id: s.id,
      sequence: s.sequence,
      type: s.type,
      status: s.status,
      storeId: s.store?.id ?? s.storeId ?? undefined,
      storeName: s.store?.name,
      lat: s.store?.latitude ?? undefined,
      lng: s.store?.longitude ?? undefined,
      address: addressLine(s.store ?? undefined),
      groups: s.groups.map((g) => ({
        orderGroupId: g.id,
        orderId: g.orderId,
        pickupCode: g.pickupCode ?? undefined,
        itemCount: g._count.items,
      })),
      arrivedAt: iso(s.arrivedAt),
      doneAt: iso(s.doneAt),
    };
  }
  const addr = (s.order?.addressSnapshot ?? null) as AddressLike | null;
  return {
    id: s.id,
    sequence: s.sequence,
    type: s.type,
    status: s.status,
    orderId: s.order?.id ?? s.orderId ?? undefined,
    customerName: s.order?.user.name,
    lat: addr?.latitude ?? undefined,
    lng: addr?.longitude ?? undefined,
    address: addressLine(addr),
    arrivedAt: iso(s.arrivedAt),
    doneAt: iso(s.doneAt),
  };
}

export function toRouteDto(r: RouteWithRels) {
  return {
    id: r.id,
    status: r.status,
    estimatedEarningsCents: r.estimatedEarningsCents,
    distanceMeters: r.distanceMeters,
    offerExpiresAt: iso(r.offerExpiresAt),
    offeredAt: iso(r.offeredAt),
    acceptedAt: iso(r.acceptedAt),
    completedAt: iso(r.completedAt),
    stops: r.stops.map(toRouteStopDto),
  };
}
