import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import type { StoreReviewsPageDTO } from "@markethub/types";
import { useStoreReviews } from "../api/hooks/useStoreReviews";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 56: hook da vitrine pública de avaliações. Mocka o módulo marketplace
 * (a query usa mkt.storeReviews) e useAuth. Valida o gate `enabled` (sem
 * merchantId não busca), a exposição de média/contagem e a paginação (ver mais).
 */

const mockStoreReviews = jest.fn();

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({ storeReviews: (...a: unknown[]) => mockStoreReviews(...a) }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

const page = (over: Partial<StoreReviewsPageDTO> = {}): StoreReviewsPageDTO => ({
  average: 4.5,
  count: 12,
  page: 1,
  pageSize: 10,
  items: [
    {
      id: "r1",
      rating: 5,
      comment: "top",
      authorName: "Ana",
      createdAt: "2026-07-10T00:00:00Z",
      replyText: null,
      repliedAt: null,
    },
  ],
  ...over,
});

type HookResult = ReturnType<typeof useStoreReviews>;
let activeClient: QueryClient | null = null;

function renderHook(merchantId: string | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: HookResult | null } = { current: null };
  function Probe() {
    result.current = useStoreReviews(merchantId);
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
  mockStoreReviews.mockReset().mockResolvedValue(page());
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useStoreReviews", () => {
  it("não busca sem merchantId (enabled false)", async () => {
    const { result, unmount } = renderHook(undefined);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockStoreReviews).not.toHaveBeenCalled();
    expect(result.current!.count).toBe(0);
    expect(result.current!.items).toEqual([]);
    unmount();
  });

  it("busca a 1a página e expõe média/contagem/itens", async () => {
    const { result, unmount } = renderHook("m1");
    await waitFor(() => result.current!.items.length > 0);
    expect(mockStoreReviews).toHaveBeenCalledWith("m1", 1);
    expect(result.current!.average).toBe(4.5);
    expect(result.current!.count).toBe(12);
    expect(result.current!.hasMore).toBe(true);
    unmount();
  });

  it("loadMore busca a próxima página e acumula os itens", async () => {
    mockStoreReviews
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(
        page({
          page: 2,
          items: [
            {
              id: "r2",
              rating: 3,
              comment: "ok",
              authorName: "Bia",
              createdAt: "2026-07-09T00:00:00Z",
              replyText: null,
              repliedAt: null,
            },
          ],
        }),
      );
    const { result, unmount } = renderHook("m1");
    await waitFor(() => result.current!.items.length === 1);
    act(() => {
      result.current!.loadMore();
    });
    await waitFor(() => result.current!.items.length === 2);
    expect(mockStoreReviews).toHaveBeenLastCalledWith("m1", 2);
    expect(result.current!.items.map((i) => i.id)).toEqual(["r1", "r2"]);
    unmount();
  });

  it("sem mais páginas: hasMore false quando count cabe numa página", async () => {
    mockStoreReviews.mockResolvedValue(page({ count: 1 }));
    const { result, unmount } = renderHook("m1");
    await waitFor(() => result.current!.items.length > 0);
    expect(result.current!.hasMore).toBe(false);
    unmount();
  });

  it("queryKey vem de queryKeys.storeReviews (não-literal)", () => {
    expect(queryKeys.storeReviews.byMerchant("m1")).toEqual(["store-reviews", "m1"]);
  });
});
