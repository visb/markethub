import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import { useExploreMap } from "../api/hooks/useExploreMap";
import { DEFAULT_CENTER } from "../lib/mapRegion";
import type { Address, NearbyStoreDTO } from "../api/marketplace";

/**
 * Story 05: ViewModel do mapa. Mocka GPS (@/location), endereços e storesNearby
 * (marketplace). Valida o centro (GPS → endereço → padrão), o pin de destino e
 * que os marcadores recebem as coordenadas vindas do endpoint.
 */

const mockDeviceLatLng = jest.fn();
const mockAddresses = jest.fn();
const mockStoresNearby = jest.fn();

jest.mock("@/location", () => ({ deviceLatLng: () => mockDeviceLatLng() }));

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({
      addresses: () => mockAddresses(),
      storesNearby: (...a: unknown[]) => mockStoresNearby(...a),
    }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

function addr(over: Partial<Address> = {}): Address {
  return {
    id: "a1", label: "Casa", street: "R", number: "1", district: null,
    city: "Curitiba", state: "PR", zipCode: "80000-000",
    latitude: -25.5, longitude: -49.3, isDefault: true, ...over,
  };
}

const STORE: NearbyStoreDTO = {
  id: "st1", name: "Mercado", latitude: -25.6, longitude: -49.4,
  city: "Curitiba", state: "PR", avgPrepMinutes: 30, merchantName: "Rede", merchantLogoUrl: null,
};

type HookResult = ReturnType<typeof useExploreMap>;
let activeClient: QueryClient | null = null;

function renderHook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: HookResult | null } = { current: null };
  function Probe() {
    result.current = useExploreMap();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return { result, unmount: () => { act(() => tree!.unmount()); client.clear(); } };
}

async function waitFor(predicate: () => boolean, tries = 80) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

beforeEach(() => {
  mockDeviceLatLng.mockReset().mockResolvedValue(null);
  mockAddresses.mockReset().mockResolvedValue([]);
  mockStoresNearby.mockReset().mockResolvedValue([]);
});
afterEach(() => { activeClient?.clear(); activeClient = null; });

describe("useExploreMap", () => {
  it("centra no GPS quando concedido", async () => {
    mockDeviceLatLng.mockResolvedValue({ latitude: -10, longitude: -20 });
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.ready);
    expect(result.current!.initialRegion.latitude).toBe(-10);
    expect(result.current!.initialRegion.longitude).toBe(-20);
    unmount();
  });

  it("GPS negado → centra no endereço ativo (default)", async () => {
    mockDeviceLatLng.mockResolvedValue(null);
    mockAddresses.mockResolvedValue([addr({ latitude: -25.5, longitude: -49.3 })]);
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.ready);
    expect(result.current!.initialRegion.latitude).toBe(-25.5);
    unmount();
  });

  it("sem GPS e sem endereço → centro padrão, sem pin de destino", async () => {
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.ready);
    expect(result.current!.initialRegion.latitude).toBe(DEFAULT_CENTER.latitude);
    expect(result.current!.destination).toBeNull();
    unmount();
  });

  it("endereço ativo com lat/lng → pin de destino com as coords corretas", async () => {
    mockAddresses.mockResolvedValue([addr({ latitude: -25.5, longitude: -49.3 })]);
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.ready);
    expect(result.current!.destination).toEqual({ latitude: -25.5, longitude: -49.3 });
    unmount();
  });

  it("endereço sem lat/lng → não renderiza pin de destino", async () => {
    mockAddresses.mockResolvedValue([addr({ latitude: null, longitude: null })]);
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.ready);
    expect(result.current!.destination).toBeNull();
    unmount();
  });

  it("busca mercados com bounds derivados e expõe os marcadores", async () => {
    mockDeviceLatLng.mockResolvedValue({ latitude: 0, longitude: 0 });
    mockStoresNearby.mockResolvedValue([STORE]);
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.stores.length === 1);
    // bounds derivados do centro+deltas: north>south, east>west
    const callArg = mockStoresNearby.mock.calls[0][0];
    expect(callArg.north).toBeGreaterThan(callArg.south);
    expect(callArg.east).toBeGreaterThan(callArg.west);
    expect(result.current!.stores[0]).toEqual(STORE);
    unmount();
  });
});
