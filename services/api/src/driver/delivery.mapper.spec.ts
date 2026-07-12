import { DeliveryStatus } from "@prisma/client";
import { toDeliveryDto } from "./delivery.mapper";

/**
 * Story 59: o DTO de entrega carrega as coordenadas da loja e do endereço de
 * entrega (snapshot) para o mapa do driver. Endereço/loja sem lat/lng → campo
 * null (o app esconde o marcador).
 */

type Rels = Parameters<typeof toDeliveryDto>[0];

function makeDelivery(over: {
  storeLat?: number | null;
  storeLng?: number | null;
  addressSnapshot?: unknown;
} = {}): Rels {
  return {
    id: "dlv1",
    status: DeliveryStatus.assigned,
    driverId: null,
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    failReason: null,
    failNote: null,
    failedAt: null,
    createdAt: new Date("2026-07-11T12:00:00.000Z"),
    storeId: "st1",
    orderGroup: {
      id: "og1",
      orderId: "ord1",
      store: {
        id: "st1",
        name: "Mercado Central",
        latitude: over.storeLat === undefined ? -25.43 : over.storeLat,
        longitude: over.storeLng === undefined ? -49.27 : over.storeLng,
      },
      _count: { items: 3 },
      order: {
        deliveryCode: "1234",
        addressSnapshot:
          "addressSnapshot" in over
            ? over.addressSnapshot
            : { street: "Rua A", number: "10", city: "Curitiba", state: "PR", latitude: -25.5, longitude: -49.3 },
        user: { name: "Cliente" },
      },
    },
    driver: null,
  };
}

describe("toDeliveryDto — coordenadas (story 59)", () => {
  it("mapeia lat/lng da loja e do endereço de entrega", () => {
    const dto = toDeliveryDto(makeDelivery());
    expect(dto.storeLat).toBe(-25.43);
    expect(dto.storeLng).toBe(-49.27);
    expect(dto.destLat).toBe(-25.5);
    expect(dto.destLng).toBe(-49.3);
    expect(dto.address).toBe("Rua A, 10, Curitiba, PR");
  });

  it("endereço sem lat/lng → destLat/destLng null", () => {
    const dto = toDeliveryDto(
      makeDelivery({ addressSnapshot: { street: "Rua A", number: "10", city: "Curitiba" } }),
    );
    expect(dto.destLat).toBeNull();
    expect(dto.destLng).toBeNull();
    // ainda formata o endereço textual disponível
    expect(dto.address).toBe("Rua A, 10, Curitiba");
  });

  it("sem addressSnapshot → destLat/destLng null e address undefined", () => {
    const dto = toDeliveryDto(makeDelivery({ addressSnapshot: null }));
    expect(dto.destLat).toBeNull();
    expect(dto.destLng).toBeNull();
    expect(dto.address).toBeUndefined();
  });

  it("loja sem geo → storeLat/storeLng null", () => {
    const dto = toDeliveryDto(makeDelivery({ storeLat: null, storeLng: null }));
    expect(dto.storeLat).toBeNull();
    expect(dto.storeLng).toBeNull();
  });
});
