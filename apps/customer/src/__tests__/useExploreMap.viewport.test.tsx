import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import { useExploreMap, VIEWPORT_DEBOUNCE_MS } from "../api/hooks/useExploreMap";
import type { NearbyStoreDTO, ViewportBoundsDTO } from "../api/marketplace";

/**
 * Story 06: recarga por viewport + debounce + overlay (fetching). Mocka GPS,
 * endereços e storesNearby (marketplace). Usa timers reais (como o teste da
 * story 05) — o debounce é curto (~400ms), então esperar de verdade é robusto e
 * não briga com o batching interno do React Query. Gestos rápidos sucessivos
 * resultam em UMA chamada com os ÚLTIMOS bounds.
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

const STORE = (id: string): NearbyStoreDTO => ({
  id,
  name: `Mercado ${id}`,
  latitude: -25.6,
  longitude: -49.4,
  city: "Curitiba",
  state: "PR",
  avgPrepMinutes: 30,
  merchantName: "Rede",
  merchantLogoUrl: null,
});

const bbox = (n: number): ViewportBoundsDTO => ({ north: n, south: n - 1, east: n, west: n - 1 });

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

async function wait(ms: number) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

async function waitFor(predicate: () => boolean, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

beforeEach(() => {
  mockDeviceLatLng.mockReset().mockResolvedValue({ latitude: 0, longitude: 0 });
  mockAddresses.mockReset().mockResolvedValue([]);
  mockStoresNearby.mockReset().mockResolvedValue([STORE("inicial")]);
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useExploreMap — recarga por viewport (story 06)", () => {
  it("expõe onViewportChange e busca sob demanda nos novos bounds após o debounce", async () => {
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.stores.length === 1);
    expect(typeof result.current!.onViewportChange).toBe("function");
    const callsAntes = mockStoresNearby.mock.calls.length;
    expect(callsAntes).toBeGreaterThanOrEqual(1);

    mockStoresNearby.mockResolvedValue([STORE("novo")]);
    act(() => result.current!.onViewportChange(bbox(50)));
    await waitFor(() => {
      const last = mockStoresNearby.mock.calls.at(-1)?.[0];
      return JSON.stringify(last) === JSON.stringify(bbox(50));
    });
    const last = mockStoresNearby.mock.calls.at(-1)![0];
    expect(last).toEqual(bbox(50));
    unmount();
  });

  it("gestos rápidos sucessivos → UMA chamada com os últimos bounds (debounce)", async () => {
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.stores.length === 1);
    const callsAntes = mockStoresNearby.mock.calls.length;

    // três gestos dentro da janela de debounce: só o último deve disparar
    act(() => {
      result.current!.onViewportChange(bbox(10));
      result.current!.onViewportChange(bbox(20));
      result.current!.onViewportChange(bbox(30));
    });
    // antes do debounce concluir → nenhuma chamada nova
    await wait(VIEWPORT_DEBOUNCE_MS - 150);
    expect(mockStoresNearby.mock.calls.length).toBe(callsAntes);

    await waitFor(() => mockStoresNearby.mock.calls.length > callsAntes);
    const novas = mockStoresNearby.mock.calls.slice(callsAntes);
    expect(novas.length).toBe(1);
    expect(novas[0][0]).toEqual(bbox(30));
    unmount();
  });

  it("fetching é true enquanto a leva do viewport carrega e false ao concluir", async () => {
    let resolveFetch: (v: NearbyStoreDTO[]) => void = () => {};
    mockStoresNearby.mockReturnValue(
      new Promise<NearbyStoreDTO[]>((res) => { resolveFetch = res; }),
    );
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.fetching === true);
    expect(result.current!.fetching).toBe(true);

    await act(async () => {
      resolveFetch([STORE("ok")]);
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => result.current!.fetching === false);
    expect(result.current!.fetching).toBe(false);
    unmount();
  });

  it("keepPreviousData: pins antigos permanecem enquanto a próxima leva carrega", async () => {
    const { result, unmount } = renderHook();
    await waitFor(() => result.current!.stores.length === 1);
    expect(result.current!.stores.map((s) => s.id)).toEqual(["inicial"]);

    // próxima leva: promessa pendente — pins anteriores devem permanecer
    let resolveNext: (v: NearbyStoreDTO[]) => void = () => {};
    mockStoresNearby.mockReturnValue(
      new Promise<NearbyStoreDTO[]>((res) => { resolveNext = res; }),
    );
    act(() => result.current!.onViewportChange(bbox(99)));
    await waitFor(() => result.current!.fetching === true);
    // ainda os antigos (não piscou para vazio)
    expect(result.current!.stores.map((s) => s.id)).toEqual(["inicial"]);

    await act(async () => {
      resolveNext([STORE("proximo")]);
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => result.current!.stores.some((s) => s.id === "proximo"));
    expect(result.current!.stores.map((s) => s.id)).toEqual(["proximo"]);
    unmount();
  });
});
