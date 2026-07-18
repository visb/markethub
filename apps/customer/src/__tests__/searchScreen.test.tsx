import React from "react";
import renderer, { act } from "react-test-renderer";
import SearchScreen from "../../app/search";
import type { SearchResultItemDTO } from "@/api/marketplace";

/**
 * Story 80: tela de resultado da busca global. Mocka os hooks de dados
 * (useProductSearch/useSearchGeo), o carrinho e o expo-router. Valida: itens
 * renderizam com o badge da loja, estado vazio, loading e paginação (onEndReached
 * → loadMore quando há mais).
 */

const item = (over: Partial<SearchResultItemDTO> = {}): SearchResultItemDTO => ({
  offerId: "o1",
  id: "p1",
  name: "Arroz Branco",
  brand: "Tio João",
  packageSize: "1kg",
  saleType: "unit",
  imageUrl: null,
  gtin: null,
  category: null,
  priceCents: 1000,
  promoPriceCents: null,
  storeId: "s1",
  storeName: "Mercado A",
  distanceKm: 2.5,
  ...over,
});

const mockSearchState = {
  current: {
    items: [item()] as SearchResultItemDTO[],
    isLoading: false,
    hasMore: false,
    loadMore: jest.fn(),
    isLoadingMore: false,
  },
};

jest.mock("../api/hooks/useProductSearch", () => ({
  useProductSearch: () => mockSearchState.current,
  useSearchGeo: () => ({ lat: -23.5, lng: -46.6, radiusKm: 10 }),
}));

const mockCart = {
  labelFor: jest.fn().mockReturnValue(null),
  add: jest.fn(),
  inc: jest.fn(),
  dec: jest.fn(),
  total: 0,
};
jest.mock("../use-cart", () => ({ useCart: () => mockCart }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ q: "arroz" }),
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SearchScreen />);
  });
  return tree;
}

/** Concatena todo o texto renderizado (children string) da árvore. */
function texts(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAll(() => true)
    .flatMap((n) => n.children)
    .filter((c): c is string => typeof c === "string")
    .join(" ");
}

beforeEach(() => {
  mockSearchState.current = {
    items: [item()],
    isLoading: false,
    hasMore: false,
    loadMore: jest.fn(),
    isLoadingMore: false,
  };
  mockPush.mockClear();
});

describe("SearchScreen — resultado (story 80)", () => {
  it("renderiza os itens com o badge da loja", () => {
    const tree = render();
    expect(tree.root.findAll((n) => n.props.testID === "store-badge").length).toBeGreaterThan(0);
    const t = texts(tree);
    expect(t).toContain("Arroz Branco");
    expect(t).toContain("Mercado A");
    expect(t).toContain("(2.5km)");
  });

  it("estado vazio informa que nada foi encontrado", () => {
    mockSearchState.current = { ...mockSearchState.current, items: [] };
    expect(texts(render())).toContain("Nenhum produto encontrado");
  });

  it("loading mostra indicador e não a lista", () => {
    mockSearchState.current = { ...mockSearchState.current, isLoading: true, items: [] };
    const tree = render();
    expect(tree.root.findAll((n) => n.props.testID === "store-badge")).toHaveLength(0);
  });

  it("onEndReached dispara loadMore quando há mais páginas", () => {
    const loadMore = jest.fn();
    mockSearchState.current = { ...mockSearchState.current, hasMore: true, loadMore };
    const tree = render();
    const list = tree.root.findAll((n) => typeof n.props.onEndReached === "function")[0];
    act(() => {
      list.props.onEndReached();
    });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("onEndReached não dispara loadMore quando não há mais páginas", () => {
    const loadMore = jest.fn();
    mockSearchState.current = { ...mockSearchState.current, hasMore: false, loadMore };
    const tree = render();
    const list = tree.root.findAll((n) => typeof n.props.onEndReached === "function")[0];
    act(() => {
      list.props.onEndReached();
    });
    expect(loadMore).not.toHaveBeenCalled();
  });
});
