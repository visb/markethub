import React from "react";
import renderer, { act } from "react-test-renderer";
import { ApiClientError } from "@markethub/api-client";
import CheckoutScreen from "../../app/checkout";
import type { Address, CartView, SlotView } from "../api/marketplace";

/**
 * Story 40: tela de checkout (`app/checkout.tsx`) — escolhe entrega vs retirada,
 * método (portão/porta com door surcharge), agendamento por slot e cria o pedido.
 * useAuth (ApiClient falso roteado por URL), expo-router, safe-area e ícones
 * mockados; sem rede.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
}));

const ADDR: Address[] = [
  { id: "a1", label: "Casa", street: "Rua A", number: "1", city: "Curitiba", state: "PR", zipCode: "80000-000", latitude: -25, longitude: -49, isDefault: true },
];
const CART: CartView = {
  couponCode: "PROMO",
  itemCount: 1,
  groups: [{ merchantId: "m1", merchant: "Rede A", merchantLogoUrl: null, storeId: "s1", etaMinutes: 30, distanceKm: 2, deliveryFeeCents: 800, minOrderCents: null, missingForMinCents: 0, allowsPickup: true, items: [] }],
  totals: { itemsCents: 5000, deliveryCents: 800, prepCents: 0, platformFeeCents: 200, discountCents: 500, doorSurchargeCents: 0, totalCents: 5500, groups: [] },
};
const SLOTS: SlotView[] = [
  { id: "sl1", storeId: "s1", start: "2026-07-01T12:00:00.000Z", end: "2026-07-01T14:00:00.000Z", capacity: 5, reserved: 1, remaining: 4 },
];

const checkoutBody: { last?: unknown } = {};
function defaultRequest(url: string, opts?: { method?: string; body?: unknown }) {
  if (url === "/addresses") return Promise.resolve(ADDR);
  if (url === "/cart") return Promise.resolve(CART);
  if (url.endsWith("/slots")) return Promise.resolve(SLOTS);
  if (url === "/checkout") {
    checkoutBody.last = opts?.body;
    return Promise.resolve({ id: "ord1" });
  }
  return Promise.resolve({});
}
const mockRequest = jest.fn(defaultRequest);
jest.mock("../auth-context", () => ({ useAuth: () => ({ api: { request: mockRequest } }) }));

type Inst = renderer.ReactTestInstance;
async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<CheckoutScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return tree;
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
function radio(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAll((n) => typeof n.props.onPress === "function")
    .find((n) => deepText(n).includes(label))!;
}
function proceed(tree: renderer.ReactTestRenderer) {
  return tree.root.findAll((n) => n.props.title === "Prosseguir para Pagamento")[0];
}

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockImplementation(defaultRequest);
  mockReplace.mockClear();
  mockPush.mockClear();
  checkoutBody.last = undefined;
});

describe("CheckoutScreen", () => {
  it("entrega: usa o endereço padrão e cria o pedido com método porta", async () => {
    const tree = await mount();
    expect(JSON.stringify(tree.toJSON())).toContain("Rua A");
    act(() => radio(tree, "Entregar na minha porta").props.onPress());
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    expect(checkoutBody.last).toEqual({
      fulfillment: "delivery",
      addressId: "a1",
      deliveryMethod: "door",
      deliverySlotId: null,
    });
    expect(mockReplace).toHaveBeenCalledWith("/payment/ord1");
  });

  it("retirada: cria o pedido como pickup sem endereço", async () => {
    const tree = await mount();
    act(() => radio(tree, "Retirar na loja").props.onPress());
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    expect(checkoutBody.last).toEqual({ fulfillment: "pickup", deliverySlotId: null });
    expect(mockReplace).toHaveBeenCalledWith("/payment/ord1");
  });

  it("loja fechada (STORE_CLOSED): mostra o erro e o CTA de agendamento (story 52)", async () => {
    mockRequest.mockImplementation((url: string) => {
      if (url === "/addresses") return Promise.resolve(ADDR);
      if (url === "/cart") return Promise.resolve(CART);
      if (url.endsWith("/slots")) return Promise.resolve(SLOTS);
      if (url === "/checkout") {
        return Promise.reject(
          new ApiClientError(400, { code: "STORE_CLOSED", message: "A loja Rede A está fechada agora." }),
        );
      }
      return Promise.resolve({});
    });
    const tree = await mount();
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("A loja Rede A está fechada agora.");
    expect(text).toContain("Agendar para um horário disponível");
    expect(mockReplace).not.toHaveBeenCalled();
    // CTA leva ao agendamento → aparece a seção de slots
    act(() => radio(tree, "Agendar para um horário disponível").props.onPress());
    await act(async () => {
      await Promise.resolve();
    });
    expect(JSON.stringify(tree.toJSON())).toContain("vaga(s)");
  });

  it("loja pausada (STORE_PAUSED): mostra o erro SEM CTA de agendamento (story 57)", async () => {
    mockRequest.mockImplementation((url: string) => {
      if (url === "/addresses") return Promise.resolve(ADDR);
      if (url === "/cart") return Promise.resolve(CART);
      if (url.endsWith("/slots")) return Promise.resolve(SLOTS);
      if (url === "/checkout") {
        return Promise.reject(
          new ApiClientError(400, {
            code: "STORE_PAUSED",
            message: "A loja Rede A está temporariamente pausada e não recebe pedidos no momento.",
          }),
        );
      }
      return Promise.resolve({});
    });
    const tree = await mount();
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("temporariamente pausada");
    // pausa bloqueia tudo → sem CTA de agendar
    expect(text).not.toContain("Agendar para um horário disponível");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("fora do raio (OUT_OF_DELIVERY_AREA): mostra o erro e o CTA de retirada (story 58)", async () => {
    mockRequest.mockImplementation((url: string) => {
      if (url === "/addresses") return Promise.resolve(ADDR);
      if (url === "/cart") return Promise.resolve(CART);
      if (url.endsWith("/slots")) return Promise.resolve(SLOTS);
      if (url === "/checkout") {
        return Promise.reject(
          new ApiClientError(400, {
            code: "OUT_OF_DELIVERY_AREA",
            message: "A loja Rede A não entrega no endereço selecionado (fora do raio de cobertura).",
          }),
        );
      }
      return Promise.resolve({});
    });
    const tree = await mount();
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("fora do raio de cobertura");
    expect(text).toContain("Trocar para retirada na loja");
    expect(mockReplace).not.toHaveBeenCalled();
    // CTA troca para retirada → o próximo checkout vai como pickup
    act(() => radio(tree, "Trocar para retirada na loja").props.onPress());
    mockRequest.mockImplementation(defaultRequest);
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    expect(checkoutBody.last).toEqual({ fulfillment: "pickup", deliverySlotId: null });
  });

  it("pedido mínimo (MIN_ORDER_NOT_MET): mostra o erro sem CTA (story 58)", async () => {
    mockRequest.mockImplementation((url: string) => {
      if (url === "/addresses") return Promise.resolve(ADDR);
      if (url === "/cart") return Promise.resolve(CART);
      if (url.endsWith("/slots")) return Promise.resolve(SLOTS);
      if (url === "/checkout") {
        return Promise.reject(
          new ApiClientError(400, {
            code: "MIN_ORDER_NOT_MET",
            message: "O pedido mínimo da loja Rede A não foi atingido.",
          }),
        );
      }
      return Promise.resolve({});
    });
    const tree = await mount();
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("O pedido mínimo da loja Rede A não foi atingido.");
    expect(text).not.toContain("Trocar para retirada na loja");
    expect(text).not.toContain("Agendar para um horário disponível");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("agendar: carrega slots; sem slot escolhido não cria pedido, com slot inclui o id", async () => {
    const tree = await mount();
    await act(async () => {
      radio(tree, "Agendar").props.onPress();
      await Promise.resolve();
    });
    // sem slot escolhido → place() retorna cedo
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    expect(checkoutBody.last).toBeUndefined();
    // escolhe o slot e tenta de novo
    act(() => radio(tree, "vaga(s)").props.onPress());
    await act(async () => {
      await proceed(tree).props.onPress();
    });
    expect((checkoutBody.last as { deliverySlotId?: string }).deliverySlotId).toBe("sl1");
  });
});
