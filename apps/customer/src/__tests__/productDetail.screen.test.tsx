import React from "react";
import renderer, { act } from "react-test-renderer";
import ProductDetailScreen from "../../app/product/[id]";
import type { ProductDetail } from "../api/marketplace";

/**
 * Story 31: comportamento do add no modal de produto. Mocka os hooks de dados
 * (useProductDetail/useFavorites/useToggleFavorite/useAddCartItem), o toast e o
 * expo-router. Valida que o "Adicionar" da oferta principal adiciona + fecha
 * (router.back, NÃO router.push/cart) e que o de uma oferta secundária mantém
 * router.push("/cart").
 */

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
    { id: "main", priceCents: 1000, promoPriceCents: null, store: { id: "s1", name: "A", merchant: { name: "Rede A", logoUrl: null } } },
    { id: "other", priceCents: 1200, promoPriceCents: null, store: { id: "s2", name: "B", merchant: { name: "Rede B", logoUrl: null } } },
  ],
};

const mockMutateAsync = jest.fn().mockResolvedValue({});
const mockProduct = { current: PRODUCT as ProductDetail | null };

jest.mock("../api/hooks/useProductDetail", () => ({
  useProductDetail: () => ({ product: mockProduct.current }),
  useFavorites: () => ({ favorites: [] }),
  useToggleFavorite: () => ({ mutate: jest.fn(), isPending: false }),
  useAddCartItem: () => ({ mutateAsync: (...a: unknown[]) => mockMutateAsync(...a) }),
}));

const mockToastShow = jest.fn();
jest.mock("../components/Toast", () => ({ useToast: () => ({ show: mockToastShow }) }));

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "p1" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<ProductDetailScreen />); });
  return tree;
}

function buttonsByTitle(tree: renderer.ReactTestRenderer, title: string) {
  // Os Button (@markethub/ui) expõem `title`+`onPress` no próprio elemento.
  return tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === "function");
}

beforeEach(() => {
  mockMutateAsync.mockClear().mockResolvedValue({});
  mockToastShow.mockClear();
  mockBack.mockClear();
  mockPush.mockClear();
  mockProduct.current = PRODUCT;
});

describe("ProductDetailScreen — add (story 31)", () => {
  it("sem produto mostra loading e não quebra", () => {
    mockProduct.current = null;
    const tree = render();
    expect(buttonsByTitle(tree, "Adicionar").length).toBe(0);
  });

  it("oferta principal: adiciona + toast + router.back (não vai pro cart)", async () => {
    const tree = render();
    // footer (oferta principal) é o último botão "Adicionar".
    const adds = buttonsByTitle(tree, "Adicionar");
    const footer = adds[adds.length - 1];
    await act(async () => { await footer.props.onPress(); });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: "main", quantity: 1 }),
    );
    expect(mockToastShow).toHaveBeenCalledWith("Adicionado ✓");
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalledWith("/cart");
  });

  it("oferta secundária: mantém router.push('/cart')", async () => {
    const tree = render();
    // primeiro "Adicionar" é o da oferta secundária (lista "outros mercados").
    const other = buttonsByTitle(tree, "Adicionar")[0];
    await act(async () => { await other.props.onPress(); });
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: "other" }),
    );
    expect(mockPush).toHaveBeenCalledWith("/cart");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
