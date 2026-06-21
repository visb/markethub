import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import { useNearbyStores } from "../api/hooks/useNearbyStores";
import { queryKeys } from "../lib/queryKeys";
import type { NearbyStoreDTO, ViewportBoundsDTO } from "../api/marketplace";

/**
 * Story 05: hook dos marcadores do mapa. Mocka o módulo marketplace (a query usa
 * mkt.storesNearby) e useAuth. Valida bounds → request e o gate `enabled`.
 */

const mockStoresNearby = jest.fn();

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({ storesNearby: (...a: unknown[]) => mockStoresNearby(...a) }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

const BOUNDS: ViewportBoundsDTO = { north: 1, south: -1, east: 2, west: -2 };
const STORE: NearbyStoreDTO = {
  id: "st1",
  name: "Mercado Um",
  latitude: 0,
  longitude: 0,
  city: "Curitiba",
  state: "PR",
  avgPrepMinutes: 30,
  merchantName: "Rede X",
  merchantLogoUrl: null,
};

type HookResult = ReturnType<typeof useNearbyStores>;
let activeClient: QueryClient | null = null;

function renderHook(bounds: ViewportBoundsDTO | null, options?: { enabled?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: HookResult | null } = { current: null };
  function Probe() {
    result.current = useNearbyStores(bounds, options);
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

async function waitFor(predicate: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

beforeEach(() => {
  mockStoresNearby.mockReset().mockResolvedValue([STORE]);
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useNearbyStores", () => {
  it("busca com os bounds e popula os marcadores", async () => {
    const { result, unmount } = renderHook(BOUNDS);
    await waitFor(() => result.current!.stores.length === 1);
    expect(mockStoresNearby).toHaveBeenCalledWith(BOUNDS);
    expect(result.current!.stores[0].id).toBe("st1");
    unmount();
  });

  it("não busca sem bounds (enabled implícito false)", async () => {
    const { result, unmount } = renderHook(null);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockStoresNearby).not.toHaveBeenCalled();
    expect(result.current!.stores).toEqual([]);
    unmount();
  });

  it("respeita enabled=false mesmo com bounds", async () => {
    const { unmount } = renderHook(BOUNDS, { enabled: false });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockStoresNearby).not.toHaveBeenCalled();
    unmount();
  });

  it("queryKey vem de queryKeys.explore.nearby (não-literal)", () => {
    expect(queryKeys.explore.nearby(BOUNDS)).toEqual(["explore", "nearby", 1, -1, 2, -2]);
  });
});
