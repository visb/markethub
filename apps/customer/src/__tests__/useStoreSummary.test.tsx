import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import { useStoreSummary } from "../api/hooks/useStoreSummary";
import { queryKeys } from "../lib/queryKeys";
import type { StoreSummaryDTO } from "../api/marketplace";

/**
 * Story 29: hook do resumo da loja (modal explore). Mocka o módulo marketplace
 * (a query usa mkt.storeSummary) e useAuth. Valida o gate `enabled` (sem storeId
 * não busca) e a busca ao receber um id.
 */

const mockStoreSummary = jest.fn();

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({ storeSummary: (...a: unknown[]) => mockStoreSummary(...a) }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

const SUMMARY: StoreSummaryDTO = {
  id: "st1",
  name: "Loja Um - Centro",
  merchantName: "Rede X",
  merchantLogoUrl: null,
  address: { street: "Rua A", number: "1", district: "Centro", city: "Curitiba", state: "PR" },
  phone: "(41) 3000-0000",
  rating: { average: 4.5, count: 12 },
  etaMinutes: 30,
  deliveryFeeCents: 700,
  doorFeeCents: 1100,
  allowsPickup: true,
  openNow: true,
  paused: false,
};

type HookResult = ReturnType<typeof useStoreSummary>;
let activeClient: QueryClient | null = null;

function renderHook(storeId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: HookResult | null } = { current: null };
  function Probe() {
    result.current = useStoreSummary(storeId);
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
  mockStoreSummary.mockReset().mockResolvedValue(SUMMARY);
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useStoreSummary", () => {
  it("não busca sem storeId (enabled false)", async () => {
    const { result, unmount } = renderHook(null);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockStoreSummary).not.toHaveBeenCalled();
    expect(result.current!.summary).toBeNull();
    unmount();
  });

  it("busca e expõe o resumo ao receber um storeId", async () => {
    const { result, unmount } = renderHook("st1");
    await waitFor(() => result.current!.summary !== null);
    expect(mockStoreSummary).toHaveBeenCalledWith("st1");
    expect(result.current!.summary!.name).toBe("Loja Um - Centro");
    unmount();
  });

  it("queryKey vem de queryKeys.explore.storeSummary (não-literal)", () => {
    expect(queryKeys.explore.storeSummary("st1")).toEqual(["explore", "store-summary", "st1"]);
  });
});
