import React from "react";
import renderer, { act } from "react-test-renderer";
import type { RealtimeClient } from "@markethub/api-client";
import { useDeliveryLocation } from "../api/hooks/useDeliveryLocation";

/**
 * Story 51: hook da posição do entregador ao vivo. Assina o canal /delivery do
 * pedido e expõe a última posição recebida (`driver:location`). Mocka o
 * realtimeDelivery (socket fake) via auth-context.
 */

const DRIVER_LOCATION_EVENT = "driver:location";

function makeRealtime() {
  const handlers = new Map<string, (p: unknown) => void>();
  let connected = false;
  const rt = {
    connect: jest.fn(() => {
      connected = true;
      handlers.get("connect")?.(undefined);
    }),
    disconnect: jest.fn(() => {
      connected = false;
    }),
    on: jest.fn((event: string, h: (p: unknown) => void) => handlers.set(event, h)),
    emit: jest.fn(),
    subscribeOrder: jest.fn(),
    subscribeStore: jest.fn(),
    get connected() {
      return connected;
    },
  } as unknown as RealtimeClient;
  return Object.assign(rt, {
    __emit: (event: string, p: unknown) => handlers.get(event)?.(p),
  });
}

let mockRealtime: ReturnType<typeof makeRealtime>;
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ realtimeDelivery: mockRealtime }),
}));

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

let last: ReturnType<typeof useDeliveryLocation> | null = null;
function renderHook(orderId: string, enabled: boolean) {
  function Probe({ e }: { e: boolean }) {
    last = useDeliveryLocation(orderId, e);
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe e={enabled} />);
  });
  return {
    setEnabled: (e: boolean) => act(() => tree.update(<Probe e={e} />)),
    unmount: () => act(() => tree.unmount()),
  };
}

const locPayload = {
  v: 1,
  deliveryId: "d1",
  orderId: "o1",
  lat: -23.5,
  lng: -46.6,
  heading: 90,
  recordedAt: "2026-07-11T12:00:00.000Z",
};

beforeEach(() => {
  last = null;
  mockRealtime = makeRealtime();
});

describe("useDeliveryLocation", () => {
  it("habilitado: conecta e assina o canal do pedido", async () => {
    renderHook("o1", true);
    await flush();
    expect(mockRealtime.connect).toHaveBeenCalled();
    expect(mockRealtime.subscribeOrder).toHaveBeenCalledWith("o1");
  });

  it("evento driver:location expõe a posição do entregador", async () => {
    renderHook("o1", true);
    await flush();
    act(() => mockRealtime.__emit(DRIVER_LOCATION_EVENT, locPayload));
    expect(last?.driver).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(last?.heading).toBe(90);
  });

  it("payload inválido (sem lat/lng) é ignorado", async () => {
    renderHook("o1", true);
    await flush();
    act(() => mockRealtime.__emit(DRIVER_LOCATION_EVENT, { orderId: "o1" }));
    expect(last?.driver).toBeNull();
  });

  it("desabilitado: não conecta e driver é null", async () => {
    renderHook("o1", false);
    await flush();
    expect(mockRealtime.connect).not.toHaveBeenCalled();
    expect(last?.driver).toBeNull();
  });

  it("cleanup ao desmontar: desconecta", async () => {
    const { unmount } = renderHook("o1", true);
    await flush();
    unmount();
    expect(mockRealtime.disconnect).toHaveBeenCalled();
  });

  it("heading não numérico vira null", async () => {
    renderHook("o1", true);
    await flush();
    act(() => mockRealtime.__emit(DRIVER_LOCATION_EVENT, { ...locPayload, heading: null }));
    expect(last?.driver).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(last?.heading).toBeNull();
  });
});
