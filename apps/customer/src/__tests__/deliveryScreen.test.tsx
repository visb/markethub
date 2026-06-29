import React from "react";
import renderer, { act } from "react-test-renderer";
import AddressesScreen from "../../app/delivery";
import type { Address } from "../api/marketplace";

/**
 * Story 40: tela de endereços (`app/delivery.tsx`) — lista com seleção do padrão,
 * adicionar/editar (AddressForm) e excluir, tudo via o módulo marketplace. useAuth
 * (ApiClient falso), expo-router, safe-area, ícones e expo-location mockados.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));

let list: Address[];
const mockRequest = jest.fn((url: string, opts?: { method?: string }) => {
  if (url === "/addresses" && (!opts || opts.method === undefined)) return Promise.resolve(list);
  if (url === "/coverage/cities") return Promise.resolve([{ city: "Curitiba", state: "PR" }]);
  return Promise.resolve({ id: "x" });
});
jest.mock("../auth-context", () => ({ useAuth: () => ({ api: { request: mockRequest } }) }));
type Inst = renderer.ReactTestInstance;

function addr(over: Partial<Address>): Address {
  return {
    id: "a1", label: "Casa", street: "Rua A", number: "1", city: "Curitiba", state: "PR",
    zipCode: "80000-000", latitude: -25, longitude: -49, isDefault: false, ...over,
  };
}

async function mount() {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AddressesScreen />);
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
/** addrMain (choose) da linha que contém `label`. */
function chooseFor(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAll((n) => typeof n.props.onPress === "function")
    .find((n) => deepText(n).includes(label))!;
}
/** pencil/trash de cada linha têm hitSlop=8 (addrMain não tem). Ordem global:
 *  [Casa.pencil, Casa.trash, Trabalho.pencil, Trabalho.trash]. */
function iconButtons(tree: renderer.ReactTestRenderer) {
  // só os Pressable compostos (o nó host interno duplicaria cada botão)
  return tree.root.findAll(
    (n) => typeof n.props.onPress === "function" && n.props.hitSlop === 8 && typeof n.type !== "string",
  );
}
function byTitle(tree: renderer.ReactTestRenderer, title: string) {
  return tree.root.findAll((n) => n.props.title === title);
}

beforeEach(() => {
  mockRequest.mockClear();
  mockBack.mockClear();
  list = [addr({ id: "a1", label: "Casa", isDefault: true }), addr({ id: "a2", label: "Trabalho", street: "Rua B" })];
});

describe("AddressesScreen", () => {
  it("lista os endereços e confirma volta com router.back", async () => {
    const tree = await mount();
    const j = json(tree);
    expect(j).toContain("Casa");
    expect(j).toContain("Trabalho");
    const confirmar = tree.root.findAll((n) => n.props.title === "Confirmar")[0];
    act(() => confirmar.props.onPress());
    expect(mockBack).toHaveBeenCalled();
  });

  it("escolher um endereço não-padrão chama setDefaultAddress", async () => {
    const tree = await mount();
    await act(async () => {
      await chooseFor(tree, "Trabalho").props.onPress();
    });
    expect(mockRequest).toHaveBeenCalledWith("/addresses/a2/default", { method: "POST", auth: true });
  });

  it("excluir chama removeAddress", async () => {
    const tree = await mount();
    await act(async () => {
      await iconButtons(tree)[6].props.onPress(); // Trabalho.trash
    });
    expect(mockRequest).toHaveBeenCalledWith("/addresses/a2", { method: "DELETE", auth: true });
  });

  it("editar abre o formulário em modo edição e cancela de volta", async () => {
    const tree = await mount();
    await act(async () => {
      iconButtons(tree)[4].props.onPress(); // Trabalho.pencil
    });
    // AddressForm com submit "Salvar alterações" (modo edição)
    expect(byTitle(tree, "Salvar alterações").length).toBeGreaterThanOrEqual(1);
    const cancelar = byTitle(tree, "Cancelar")[0];
    act(() => cancelar.props.onPress());
    // volta para a lista
    expect(byTitle(tree, "+ Adicionar endereço").length).toBeGreaterThanOrEqual(1);
  });

  it("adicionar abre o formulário de novo endereço", async () => {
    const tree = await mount();
    const add = byTitle(tree, "+ Adicionar endereço")[0];
    await act(async () => {
      add.props.onPress();
      await Promise.resolve();
    });
    // AddressForm em modo criação: submit "Adicionar endereço"
    expect(byTitle(tree, "Adicionar endereço").length).toBeGreaterThanOrEqual(1);
  });
});
