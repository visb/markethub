import React from "react";
import renderer, { act } from "react-test-renderer";
import type { OrderTracking } from "../api/marketplace";
import TrackScreen from "../../app/track/[id]";

/**
 * Story 51: a tela track/[id] mostra o mapa ao vivo na etapa de entrega em
 * andamento (own-store) e repassa a posição do entregador recebida via
 * useDeliveryLocation ao DeliveryMap. Mocka os hooks de dados e o componente de
 * mapa (captura de props) — sem engine de mapa real.
 */

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "o1" }),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const mockTracking = { current: null as OrderTracking | null };
jest.mock("@/api/hooks/useOrderTracking", () => ({
  useOrderTracking: () => ({
    tracking: mockTracking.current,
    substitutions: [],
    loading: false,
    busy: false,
    decideSubstitution: jest.fn(),
    cancelOrder: jest.fn(),
  }),
}));

const mockDriver = { current: null as { latitude: number; longitude: number } | null };
jest.mock("@/api/hooks/useDeliveryLocation", () => ({
  useDeliveryLocation: (_id: string, enabled: boolean) => ({
    driver: enabled ? mockDriver.current : null,
    heading: null,
  }),
}));

const mapProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("@/components/DeliveryMap", () => ({
  DeliveryMap: (props: Record<string, unknown>) => {
    mapProps.current = props;
    return null;
  },
}));

function makeTracking(over: Partial<OrderTracking> = {}): OrderTracking {
  return {
    orderId: "o1",
    status: "on_the_way",
    deliveryCode: "1234",
    hasPickup: false,
    hasDelivery: true,
    etaWindow: null,
    address: { street: "Rua X", number: "10", city: "SP", lat: -23.55, lng: -46.63 },
    totalCents: 5000,
    groups: [
      {
        orderGroupId: "g1",
        storeId: "s1",
        storeName: "Loja",
        storeLat: -23.5,
        storeLng: -46.6,
        merchantId: "m1",
        merchantName: "Rede",
        merchantLogoUrl: null,
        fulfillment: "delivery",
        status: "on_the_way",
        subtotalCents: 5000,
        picking: null,
        delivery: { status: "picked_up", driverName: "João" },
      },
    ],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function render() {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<TrackScreen />);
  });
  return tree!;
}

beforeEach(() => {
  mapProps.current = null;
  mockDriver.current = null;
  mockTracking.current = makeTracking();
});

describe("track/[id] — mapa ao vivo (story 51)", () => {
  it("entrega em andamento: renderiza o DeliveryMap com loja e destino", () => {
    render();
    expect(mapProps.current).not.toBeNull();
    expect(mapProps.current?.store).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(mapProps.current?.destination).toEqual({ latitude: -23.55, longitude: -46.63 });
  });

  it("posição recebida: repassa o marcador do entregador ao mapa", () => {
    mockDriver.current = { latitude: -23.52, longitude: -46.61 };
    render();
    expect(mapProps.current?.driver).toEqual({ latitude: -23.52, longitude: -46.61 });
  });

  it("retirada (sem entrega): não mostra o mapa", () => {
    mockTracking.current = makeTracking({
      hasPickup: true,
      hasDelivery: false,
      status: "ready_for_pickup",
    });
    render();
    expect(mapProps.current).toBeNull();
  });

  it("pedido ainda em preparo: não mostra o mapa", () => {
    mockTracking.current = makeTracking({ status: "preparing" });
    render();
    expect(mapProps.current).toBeNull();
  });
});
