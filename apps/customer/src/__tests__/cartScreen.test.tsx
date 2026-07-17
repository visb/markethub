import React from "react";
import renderer, { act } from "react-test-renderer";
import CartScreen from "../../app/cart";
import type { CartView } from "../api/marketplace";

/**
 * Story 40: tela do carrinho (`app/cart.tsx`) — carrega o carrinho, ajusta
 * quantidade (unit) / peso (weight) via stepper chamando updateItem/removeItem,
 * aplica/remove cupom e segue para o checkout. useAuth (ApiClient falso roteado
 * por URL), expo-router, safe-area e ícones mockados; sem rede.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
}));

function cart(over: Partial<CartView> = {}): CartView {
  return {
    couponCode: null,
    itemCount: 2,
    groups: [
      {
        merchantId: "m1",
        merchant: "Rede A",
        merchantLogoUrl: null,
        storeId: "s1",
        etaMinutes: 30,
        distanceKm: 2,
        deliveryFeeCents: 800,
        minOrderCents: null,
        missingForMinCents: 0,
        allowsPickup: true,
        merchantSuspended: false,
        items: [
          { id: "it1", offerId: "o1", name: "Arroz", imageUrl: null, saleType: "unit", packageSize: "1kg", unitPriceCents: 1000, quantity: 2, weightGrams: null, available: true },
          { id: "it2", offerId: "o2", name: "Carne", imageUrl: "http://x/c.png", saleType: "weight", packageSize: null, unitPriceCents: 4000, quantity: 1, weightGrams: 500, available: true },
        ],
      },
    ],
    totals: {
      itemsCents: 6000,
      deliveryCents: 800,
      prepCents: 100,
      platformFeeCents: 200,
      discountCents: 0,
      doorSurchargeCents: 0,
      totalCents: 7100,
      groups: [{ merchantId: "m1", subtotalCents: 6000, deliveryCents: 800, prepCents: 100, platformFeeCents: 200 }],
    },
    ...over,
  };
}

let current: CartView;
const mockRequest = jest.fn((url: string, opts?: { method?: string }) => {
  if (url === "/cart") return Promise.resolve(current);
  if (url === "/cart/coupon" && opts?.method === "POST") return Promise.resolve(cart({ couponCode: "PROMO" }));
  return Promise.resolve(current); // updateItem/removeItem retornam o carrinho
});

jest.mock("../auth-context", () => ({ useAuth: () => ({ api: { request: mockRequest } }) }));

type Inst = renderer.ReactTestInstance;
async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<CartScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
}
function json(tree: renderer.ReactTestRenderer) {
  return JSON.stringify(tree.toJSON());
}
function deepText(node: Inst): string {
  const acc: string[] = [];
  const collect = (n: Inst) => {
    const c = n.props.children;
    if (typeof c === "string" || typeof c === "number") acc.push(String(c));
    else if (Array.isArray(c)) c.forEach((x) => (typeof x === "string" || typeof x === "number") && acc.push(String(x)));
  };
  collect(node);
  node.findAll(() => true).forEach(collect);
  return acc.join(" ");
}
function pressByText(tree: renderer.ReactTestRenderer, text: string): Inst {
  return tree.root.findAll((n) => typeof n.props.onPress === "function").find((p) => deepText(p).includes(text))!;
}

beforeEach(() => {
  mockRequest.mockClear();
  mockPush.mockClear();
  current = cart();
});

describe("CartScreen", () => {
  it("carrinho vazio mostra o estado vazio e volta às compras", async () => {
    current = cart({ itemCount: 0, groups: [] });
    const tree = await mount();
    expect(json(tree)).toContain("Carrinho vazio");
    const voltar = tree.root.findAll((n) => n.props.title === "Voltar às compras")[0];
    act(() => voltar.props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("renderiza itens, totais e segue para o checkout", async () => {
    const tree = await mount();
    const j = json(tree);
    expect(j).toContain("Arroz");
    expect(j).toContain("Carne");
    expect(j).toContain("500g");
    expect(j).toContain("R$ 71,00"); // total
    const finalizar = tree.root.findAll((n) => n.props.title === "Finalizar Compra")[0];
    act(() => finalizar.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/checkout");
  });

  it("incrementa o item unit chamando updateItem com a nova quantidade", async () => {
    const tree = await mount();
    // primeiro "+" é o stepper do Arroz (unit, quantidade 2 → 3)
    await act(async () => {
      await pressByText(tree, "+").props.onPress();
    });
    expect(mockRequest).toHaveBeenCalledWith("/cart/items/it1", {
      method: "PATCH",
      auth: true,
      body: { quantity: 3 },
    });
  });

  it("mostra a barra de mínimo e desabilita o checkout quando abaixo do mínimo (story 58)", async () => {
    current = cart({
      groups: [
        {
          ...cart().groups[0]!,
          minOrderCents: 8000,
          missingForMinCents: 2000,
        },
      ],
    });
    const tree = await mount();
    const j = json(tree);
    // texto renderiza em pedaços (Faltam / valor / loja) — casa os trechos e o testID.
    expect(j).toContain("min-order-m1");
    expect(j).toContain("para o mínimo de");
    expect(j).toContain("R$ 20,00");
    expect(j).toContain("cart-min-hint");
    const finalizar = tree.root.findAll((n) => n.props.title === "Finalizar Compra")[0]!;
    expect(finalizar.props.disabled).toBe(true);
  });

  it("mínimo atingido: checkout habilitado, sem barra (story 58)", async () => {
    const tree = await mount();
    const j = json(tree);
    expect(j).not.toContain("para o mínimo de");
    const finalizar = tree.root.findAll((n) => n.props.title === "Finalizar Compra")[0]!;
    expect(finalizar.props.disabled).toBe(false);
  });

  // Story 69: rede suspensa → aviso no grupo e checkout bloqueado.
  it("rede suspensa: mostra o aviso do grupo e desabilita o checkout (story 69)", async () => {
    current = cart({
      groups: [{ ...cart().groups[0]!, merchantSuspended: true }],
    });
    const tree = await mount();
    const j = json(tree);
    expect(j).toContain("suspended-m1");
    expect(j).toContain("temporariamente indisponível");
    expect(j).toContain("cart-suspended-hint");
    const finalizar = tree.root.findAll((n) => n.props.title === "Finalizar Compra")[0]!;
    expect(finalizar.props.disabled).toBe(true);
  });

  it("sem rede suspensa: sem aviso e checkout habilitado (story 69)", async () => {
    const tree = await mount();
    const j = json(tree);
    expect(j).not.toContain("suspended-m1");
    expect(j).not.toContain("cart-suspended-hint");
    const finalizar = tree.root.findAll((n) => n.props.title === "Finalizar Compra")[0]!;
    expect(finalizar.props.disabled).toBe(false);
  });

  it("aplica cupom pelo campo e exibe o código", async () => {
    const tree = await mount();
    act(() => pressByText(tree, "Adicionar cupom").props.onPress());
    const field = tree.root.findAll((n) => n.props.placeholder === "Código do cupom")[0];
    act(() => field.props.onChangeText("PROMO"));
    const aplicar = tree.root.findAll((n) => n.props.title === "Aplicar")[0];
    await act(async () => {
      await aplicar.props.onPress();
    });
    expect(mockRequest).toHaveBeenCalledWith("/cart/coupon", {
      method: "POST",
      auth: true,
      body: { code: "PROMO" },
    });
  });
});
