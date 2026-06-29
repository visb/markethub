import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import {
  useAddCartItem,
  useFavorites,
  useProductDetail,
  useToggleFavorite,
} from "../api/hooks/useProductDetail";
import { queryKeys } from "../lib/queryKeys";
import type { FavoriteView, ProductDetail } from "../api/marketplace";

/**
 * Story 31: hooks do modal de produto migrado para React Query. Mocka o módulo
 * marketplace (productDetail/favorites/addFavorite/removeFavorite/addItem) e
 * useAuth. Valida a key correta, o gate `enabled` sem id e a invalidação de
 * favoritos no toggle. Espelha useNearbyStores.test.tsx.
 */

const mockProductDetail = jest.fn();
const mockFavorites = jest.fn();
const mockAddFavorite = jest.fn();
const mockRemoveFavorite = jest.fn();
const mockAddItem = jest.fn();

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({
      productDetail: (...a: unknown[]) => mockProductDetail(...a),
      favorites: (...a: unknown[]) => mockFavorites(...a),
      addFavorite: (...a: unknown[]) => mockAddFavorite(...a),
      removeFavorite: (...a: unknown[]) => mockRemoveFavorite(...a),
      addItem: (...a: unknown[]) => mockAddItem(...a),
    }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

const PRODUCT: ProductDetail = {
  id: "p1",
  name: "Arroz",
  brand: null,
  packageSize: null,
  saleType: "unit",
  imageUrl: null,
  description: null,
  gtin: null,
  category: null,
  prepOptions: null,
  offers: [
    {
      id: "off1",
      priceCents: 1000,
      promoPriceCents: null,
      store: { id: "s1", name: "Loja", merchant: { name: "Rede", logoUrl: null } },
    },
  ],
};
const FAVORITE: FavoriteView = {
  offerId: "off1",
  createdAt: "2026-01-01",
  priceCents: 1000,
  promoPriceCents: null,
} as FavoriteView;

let activeClient: QueryClient | null = null;

function renderHook<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: T | null } = { current: null };
  function Probe() {
    result.current = useHook();
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
  return { result, client, unmount: () => { act(() => tree!.unmount()); client.clear(); } };
}

async function waitFor(predicate: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  if (!predicate()) throw new Error("waitFor: condição não satisfeita");
}

beforeEach(() => {
  mockProductDetail.mockReset().mockResolvedValue(PRODUCT);
  mockFavorites.mockReset().mockResolvedValue([FAVORITE]);
  mockAddFavorite.mockReset().mockResolvedValue({ id: "f1" });
  mockRemoveFavorite.mockReset().mockResolvedValue({ removed: true });
  mockAddItem.mockReset().mockResolvedValue({});
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useProductDetail (story 31)", () => {
  it("busca o detalhe com o id e popula o product", async () => {
    const { result, unmount } = renderHook(() => useProductDetail("p1"));
    await waitFor(() => result.current!.product != null);
    expect(mockProductDetail).toHaveBeenCalledWith("p1");
    expect(result.current!.product!.id).toBe("p1");
    unmount();
  });

  it("não busca sem id (enabled false)", async () => {
    const { result, unmount } = renderHook(() => useProductDetail(undefined));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockProductDetail).not.toHaveBeenCalled();
    expect(result.current!.product).toBeNull();
    unmount();
  });

  it("queryKey vem de queryKeys.products.detail (não-literal)", () => {
    expect(queryKeys.products.detail("p1")).toEqual(["products", "detail", "p1"]);
    expect(queryKeys.favorites.all).toEqual(["favorites"]);
  });
});

describe("useFavorites (story 31)", () => {
  it("retorna a lista de favoritos", async () => {
    const { result, unmount } = renderHook(() => useFavorites());
    await waitFor(() => result.current!.favorites.length === 1);
    expect(result.current!.favorites[0].offerId).toBe("off1");
    unmount();
  });
});

describe("useToggleFavorite (story 31)", () => {
  it("favorito ativo → remove e invalida favorites", async () => {
    const { result, client, unmount } = renderHook(() => useToggleFavorite());
    const spy = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync({ offerId: "off1", favorite: true });
    });
    expect(mockRemoveFavorite).toHaveBeenCalledWith("off1");
    expect(mockAddFavorite).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.favorites.all });
    unmount();
  });

  it("favorito inativo → adiciona e invalida favorites", async () => {
    const { result, client, unmount } = renderHook(() => useToggleFavorite());
    const spy = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      await result.current!.mutateAsync({ offerId: "off1", favorite: false });
    });
    expect(mockAddFavorite).toHaveBeenCalledWith("off1");
    expect(mockRemoveFavorite).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.favorites.all });
    unmount();
  });
});

describe("useAddCartItem (story 31)", () => {
  it("chama mkt.addItem com o body", async () => {
    const { result, unmount } = renderHook(() => useAddCartItem());
    await act(async () => {
      await result.current!.mutateAsync({ offerId: "off1", quantity: 2, note: "x" });
    });
    expect(mockAddItem).toHaveBeenCalledWith({ offerId: "off1", quantity: 2, note: "x" });
    unmount();
  });
});
