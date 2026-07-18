import React from "react";
import renderer, { act } from "react-test-renderer";
import FavoritesScreen from "../../app/favorites";
import type { FavoriteView } from "../api/marketplace";

/**
 * Story 83: tela de favoritos migrada para React Query. Mocka os hooks de dados
 * (useFavorites/useAddFavoriteToCart), o expo-router e o SafeAreaView. Valida que
 * a linha mostra o nome do MERCADO (merchantName) e não o nome da loja
 * (store.name), o empty state, o botão desabilitado para item indisponível e o
 * add via mutation navegando pro carrinho.
 */

const UNIT: FavoriteView = {
  offerId: "off1",
  createdAt: "2026-01-01",
  priceCents: 1000,
  promoPriceCents: null,
  available: true,
  product: { id: "p1", name: "Arroz", imageUrl: null, saleType: "unit", packageSize: null },
  store: { id: "s1", name: "Loja Centro", merchantName: "Rede Bom Preço", merchantLogoUrl: null },
};
const UNAVAILABLE: FavoriteView = {
  ...UNIT,
  offerId: "off2",
  available: false,
  product: { ...UNIT.product, id: "p2", name: "Feijão" },
  store: { id: "s2", name: "Loja Sul", merchantName: "Rede Norte", merchantLogoUrl: null },
};

const mockFavorites = { current: [UNIT] as FavoriteView[] };
const mockLoading = { current: false };
const mockMutate = jest.fn();
const mockIsPending = { current: false };
const mockVariables = { current: undefined as FavoriteView | undefined };

jest.mock("../api/hooks/useProductDetail", () => ({
  useFavorites: () => ({ favorites: mockFavorites.current, loading: mockLoading.current }),
  useAddFavoriteToCart: () => ({
    mutate: (...a: unknown[]) => mockMutate(...a),
    isPending: mockIsPending.current,
    variables: mockVariables.current,
  }),
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../components/MerchantLogo", () => ({ MerchantLogo: () => null }));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<FavoritesScreen />); });
  return tree;
}

function addButtons(tree: renderer.ReactTestRenderer) {
  return tree.root.findAll((n) => n.props.title === "Adicionar" && typeof n.props.onPress === "function");
}

/** Todos os textos-string renderizados (os `Text` do @markethub/ui expõem children string). */
function texts(tree: renderer.ReactTestRenderer) {
  return tree.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children as string);
}

beforeEach(() => {
  mockFavorites.current = [UNIT];
  mockLoading.current = false;
  mockMutate.mockClear();
  mockIsPending.current = false;
  mockVariables.current = undefined;
  mockPush.mockClear();
});

describe("FavoritesScreen (story 83)", () => {
  it("mostra o nome do mercado (merchantName), não o da loja", () => {
    const tree = render();
    const rendered = texts(tree);
    expect(rendered).toContain("Rede Bom Preço");
    expect(rendered).not.toContain("Loja Centro");
  });

  it("empty state quando não há favoritos", () => {
    mockFavorites.current = [];
    const tree = render();
    expect(texts(tree).some((t) => t.includes("Nenhum favorito ainda"))).toBe(true);
    expect(addButtons(tree).length).toBe(0);
  });

  it("loading mostra spinner e não renderiza lista", () => {
    mockLoading.current = true;
    const tree = render();
    expect(addButtons(tree).length).toBe(0);
  });

  it("item indisponível desabilita o botão Adicionar", () => {
    mockFavorites.current = [UNAVAILABLE];
    const tree = render();
    expect(addButtons(tree)[0].props.disabled).toBe(true);
  });

  it("adicionar dispara a mutation com o favorito e navega pro carrinho", () => {
    const tree = render();
    act(() => { addButtons(tree)[0].props.onPress(); });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ offerId: "off1" });
    // navegação acontece no onSuccess da mutation
    act(() => { mockMutate.mock.calls[0][1].onSuccess(); });
    expect(mockPush).toHaveBeenCalledWith("/cart");
  });

  it("botão do item em progresso (isPending + variables) fica desabilitado", () => {
    mockIsPending.current = true;
    mockVariables.current = UNIT;
    const tree = render();
    expect(addButtons(tree)[0].props.disabled).toBe(true);
  });
});
