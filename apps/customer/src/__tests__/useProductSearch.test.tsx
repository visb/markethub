import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApiClient } from "@markethub/api-client";
import {
  useProductSearch,
  useSearchGeo,
  useSearchSuggestions,
} from "../api/hooks/useProductSearch";
import { queryKeys } from "../lib/queryKeys";

/**
 * Story 80: hooks de busca. Mocka o módulo marketplace (searchSuggest/searchGlobal),
 * useAddresses, prefs e useAuth. Valida o gate `enabled` (≥ 2 chars), a paginação
 * (useInfiniteQuery), o recorte geo (endereço ativo + raio) e as query keys.
 */

const mockSearchSuggest = jest.fn();
const mockSearchGlobal = jest.fn();

jest.mock("../api/marketplace", () => {
  const actual = jest.requireActual("../api/marketplace");
  return {
    ...actual,
    marketplace: () => ({
      searchSuggest: (...a: unknown[]) => mockSearchSuggest(...a),
      searchGlobal: (...a: unknown[]) => mockSearchGlobal(...a),
    }),
  };
});

jest.mock("@/auth-context", () => ({ useAuth: () => ({ api: {} as ApiClient }) }));

const mockActiveAddress = { current: null as { latitude: number | null; longitude: number | null } | null };
jest.mock("../api/hooks/useAddresses", () => ({
  useAddresses: () => ({ activeAddress: mockActiveAddress.current }),
}));

jest.mock("@/prefs", () => ({
  ...jest.requireActual("@/prefs"),
  getRadiusKm: () => Promise.resolve(15),
}));

// Debounce imediato: o teste não espera 250ms.
jest.mock("@/lib/useDebouncedValue", () => ({ useDebouncedValue: (v: unknown) => v }));

let activeClient: QueryClient | null = null;

function renderHook<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeClient = client;
  const result: { current: T | null } = { current: null };
  function Probe() {
    result.current = hook();
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
  mockSearchSuggest.mockReset().mockResolvedValue({ terms: ["Arroz"], categories: [{ id: "c1", name: "Mercearia" }] });
  mockSearchGlobal.mockReset();
  mockActiveAddress.current = null;
});
afterEach(() => {
  activeClient?.clear();
  activeClient = null;
});

describe("useSearchSuggestions", () => {
  it("não busca com menos de 2 caracteres (enabled false)", async () => {
    const { result, unmount } = renderHook(() => useSearchSuggestions("a"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockSearchSuggest).not.toHaveBeenCalled();
    expect(result.current!.terms).toEqual([]);
    expect(result.current!.categories).toEqual([]);
    unmount();
  });

  it("busca e expõe termos + departamentos com termo ≥ 2 chars", async () => {
    const { result, unmount } = renderHook(() => useSearchSuggestions("arr"));
    await waitFor(() => result.current!.terms.length > 0);
    // Sem endereço ativo → geo undefined (story 82).
    expect(mockSearchSuggest).toHaveBeenCalledWith("arr", undefined);
    expect(result.current!.categories).toEqual([{ id: "c1", name: "Mercearia" }]);
    unmount();
  });

  // Story 82: repassa o geo do endereço ativo e expõe a seção de mercados.
  it("repassa geo do endereço ativo e expõe merchants", async () => {
    mockActiveAddress.current = { latitude: -23.5, longitude: -46.6 };
    mockSearchSuggest.mockResolvedValue({
      terms: [],
      categories: [],
      merchants: [{ merchantId: "m1", name: "Atacadão", logoUrl: null, storeId: "s1" }],
    });
    const { result, unmount } = renderHook(() => useSearchSuggestions("atac"));
    await waitFor(() => result.current!.merchants.length > 0);
    // A sugestão só usa lat/lng (raio não se aplica); o raio pode ainda estar
    // resolvendo nas prefs quando a chamada dispara, então não é fixado aqui.
    expect(mockSearchSuggest).toHaveBeenCalledWith(
      "atac",
      expect.objectContaining({ lat: -23.5, lng: -46.6 }),
    );
    expect(result.current!.merchants).toEqual([
      { merchantId: "m1", name: "Atacadão", logoUrl: null, storeId: "s1" },
    ]);
    unmount();
  });
});

describe("useProductSearch", () => {
  it("não busca com termo curto (enabled false)", async () => {
    const { result, unmount } = renderHook(() => useProductSearch("a"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mockSearchGlobal).not.toHaveBeenCalled();
    expect(result.current!.items).toEqual([]);
    unmount();
  });

  it("busca a página 1 e acumula itens; loadMore avança a página", async () => {
    mockSearchGlobal
      .mockResolvedValueOnce({ items: [{ offerId: "o1" }], page: 1, pageSize: 1, total: 2 })
      .mockResolvedValueOnce({ items: [{ offerId: "o2" }], page: 2, pageSize: 1, total: 2 });
    const geo = { lat: -23.5, lng: -46.6, radiusKm: 10 };
    const { result, unmount } = renderHook(() => useProductSearch("arroz", geo));
    await waitFor(() => result.current!.items.length === 1);
    expect(mockSearchGlobal).toHaveBeenCalledWith("arroz", { geo, page: 1 });
    expect(result.current!.hasMore).toBe(true);
    expect(result.current!.total).toBe(2);

    act(() => result.current!.loadMore());
    await waitFor(() => result.current!.items.length === 2);
    expect(mockSearchGlobal).toHaveBeenLastCalledWith("arroz", { geo, page: 2 });
    expect(result.current!.hasMore).toBe(false);
    unmount();
  });
});

describe("useSearchGeo", () => {
  it("sem endereço com coordenadas → undefined", async () => {
    const { result, unmount } = renderHook(() => useSearchGeo());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(result.current).toBeUndefined();
    unmount();
  });

  it("com endereço ativo compõe lat/lng + raio das prefs", async () => {
    mockActiveAddress.current = { latitude: -25.4, longitude: -49.2 };
    const { result, unmount } = renderHook(() => useSearchGeo());
    await waitFor(() => result.current != null && result.current.radiusKm === 15);
    expect(result.current).toEqual({ lat: -25.4, lng: -49.2, radiusKm: 15 });
    unmount();
  });
});

describe("query keys da busca (story 80)", () => {
  it("suggestions e results não usam literais soltos", () => {
    // Story 82: a chave de sugestões inclui o geo (lat/lng) — muda a loja do mercado.
    expect(queryKeys.search.suggestions("arr")).toEqual(["search", "suggestions", "arr", null, null]);
    expect(queryKeys.search.suggestions("arr", { lat: 1, lng: 2 })).toEqual([
      "search",
      "suggestions",
      "arr",
      1,
      2,
    ]);
    expect(queryKeys.search.results("arr", { lat: 1, lng: 2, radiusKm: 3 })).toEqual([
      "search",
      "results",
      "arr",
      1,
      2,
      3,
    ]);
    expect(queryKeys.search.results("arr")).toEqual(["search", "results", "arr", null, null, null]);
  });
});
