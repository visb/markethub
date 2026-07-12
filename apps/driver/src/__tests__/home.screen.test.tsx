import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, Pressable, Switch } from "react-native";
import { Button, Text } from "@markethub/ui";
import type { DeliveryDTO } from "@markethub/api-client";
import HomeScreen from "../../app/home";

/**
 * Story 41: tela home/entregas do entregador. Mocka os hooks de dados (React Query
 * migrado da story 41), o hook de veículo, o auth-context e o expo-router. Cobre
 * render da lista, estados (carregando / sem entregas) e a ação de aceitar (avançar
 * status). A tela em si vive em app/ (fora do escopo de cobertura) — este spec é
 * regressão de comportamento.
 */

const mockPush = jest.fn();
const mockLogout = jest.fn();
const mockMutate = jest.fn();
const mockSetAvailability = jest.fn();

const mockState = {
  stores: [{ id: "s1", name: "Loja 1" }] as { id: string; name: string }[],
  mine: [] as DeliveryDTO[],
  available: [] as DeliveryDTO[],
  storesLoading: false,
  mineLoading: false,
  acceptPending: false,
  anyError: false,
  // Story 62: turno on/off.
  isAvailable: true,
  availableSince: "2026-07-12T10:00:00.000Z" as string | null,
  availabilityPending: false,
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ user: { name: "Drv" }, logout: mockLogout }),
}));

jest.mock("@/api/hooks/useDriverVehicle", () => ({
  useCurrentVehicle: () => ({ data: { id: "v1", plate: "ABC1D23", type: "car", description: null } }),
}));

jest.mock("@/api/hooks/useDriverAvailability", () => ({
  useDriverAvailability: () => ({
    data: { available: mockState.isAvailable, availableSince: mockState.availableSince },
    isLoading: false,
  }),
  useSetAvailability: () => ({ mutate: mockSetAvailability, isPending: mockState.availabilityPending }),
}));

jest.mock("@/api/hooks/useDriverDeliveries", () => ({
  useDriverStores: () => ({
    data: mockState.stores,
    isSuccess: !mockState.storesLoading,
    isLoading: mockState.storesLoading,
    isError: mockState.anyError,
    refetch: jest.fn(),
  }),
  useDriverDeliveries: () => ({
    data: mockState.mine,
    isLoading: mockState.mineLoading,
    isError: mockState.anyError,
    refetch: jest.fn(),
  }),
  useAvailableDeliveries: () => ({ data: mockState.available, isError: mockState.anyError, refetch: jest.fn() }),
  useAcceptDelivery: () => ({ mutate: mockMutate, isPending: mockState.acceptPending, isError: false, variables: undefined }),
}));

function mkDelivery(over: Partial<DeliveryDTO>): DeliveryDTO {
  return {
    id: "d1",
    orderGroupId: "g1",
    orderId: "order-000123",
    status: "assigned",
    storeId: "s1",
    storeName: "Loja 1",
    customerName: "Cliente",
    itemCount: 2,
    ...over,
  };
}

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

/**
 * Concatena o texto renderizado. Evita JSON.stringify(tree.toJSON()) — o ScrollView
 * da home tem um prop `refreshControl` (elemento React) que cria referência circular.
 */
function screenText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((t) => {
      const c = t.props.children;
      return Array.isArray(c) ? c.map((x) => String(x)).join("") : String(c);
    })
    .join(" | ");
}

beforeEach(() => {
  mockPush.mockReset();
  mockLogout.mockReset();
  mockMutate.mockReset();
  mockSetAvailability.mockReset();
  mockState.stores = [{ id: "s1", name: "Loja 1" }];
  mockState.mine = [];
  mockState.available = [];
  mockState.storesLoading = false;
  mockState.mineLoading = false;
  mockState.acceptPending = false;
  mockState.anyError = false;
  mockState.isAvailable = true;
  mockState.availableSince = "2026-07-12T10:00:00.000Z";
  mockState.availabilityPending = false;
});

describe("HomeScreen", () => {
  it("mostra o spinner enquanto carrega", () => {
    mockState.storesLoading = true;
    const tree = render(<HomeScreen />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
  });

  it("estado vazio: sem entregas disponíveis nem atribuídas", () => {
    const tree = render(<HomeScreen />);
    const text = screenText(tree);
    expect(text).toContain("Nenhuma entrega disponível.");
    expect(text).toContain("Nenhuma entrega atribuída.");
  });

  it("renderiza a lista de entregas atribuídas com status", () => {
    mockState.mine = [mkDelivery({ status: "picked_up" })];
    const tree = render(<HomeScreen />);
    const text = screenText(tree);
    expect(text).toContain("000123");
    expect(text).toContain("Cliente");
    expect(text).toContain("A caminho");
  });

  it("aceitar uma entrega do pool dispara a mutation", () => {
    mockState.available = [mkDelivery({ id: "p1", status: "unassigned" })];
    const tree = render(<HomeScreen />);
    const acceptBtn = tree.root.findAllByType(Button).find((b) => b.props.title === "Aceitar");
    act(() => acceptBtn!.props.onPress());
    expect(mockMutate).toHaveBeenCalledWith("p1");
  });

  it("toque numa entrega atribuída navega para o detalhe", () => {
    mockState.mine = [mkDelivery({ id: "d9", orderId: "order-000999" })];
    const tree = render(<HomeScreen />);
    // Localiza a linha da entrega pelo nº do pedido renderizado (não pelo índice:
    // a árvore tem outros Pressables — indicador de veículo, botão Sair).
    const row = tree.root.findAllByType(Pressable).find((p) =>
      p.findAllByType(Text).some((t) => {
        const c = t.props.children;
        return (Array.isArray(c) ? c.map((x) => String(x)).join("") : String(c)).includes("000999");
      }),
    );
    act(() => row!.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/delivery/d9");
  });

  it("mostra mensagem de erro quando uma query falha", () => {
    mockState.anyError = true;
    const tree = render(<HomeScreen />);
    expect(screenText(tree)).toContain("Erro ao carregar");
  });

  it("seletor de loja aparece com múltiplas lojas", () => {
    mockState.stores = [
      { id: "s1", name: "Loja 1" },
      { id: "s2", name: "Loja 2" },
    ];
    const tree = render(<HomeScreen />);
    expect(screenText(tree)).toContain("Loja 2");
  });

  it("botão Sair chama logout", () => {
    const tree = render(<HomeScreen />);
    const sair = tree.root.findAllByType(Button).find((b) => b.props.title === "Sair");
    act(() => sair!.props.onPress());
    expect(mockLogout).toHaveBeenCalled();
  });

  // ── Turno on/off (story 62) ──

  it("disponível: switch ligado + rótulo 'desde HH:MM', sem banner", () => {
    mockState.isAvailable = true;
    const tree = render(<HomeScreen />);
    const sw = tree.root.findByType(Switch);
    expect(sw.props.value).toBe(true);
    const text = screenText(tree);
    expect(text).toContain("Disponível");
    expect(text).toContain("De turno desde");
    expect(tree.root.findAllByProps({ testID: "unavailable-banner" }).length).toBe(0);
  });

  it("indisponível: banner sobre a lista + aceitar desabilitado", () => {
    mockState.isAvailable = false;
    mockState.availableSince = null;
    mockState.available = [mkDelivery({ id: "p1", status: "unassigned" })];
    const tree = render(<HomeScreen />);
    const sw = tree.root.findByType(Switch);
    expect(sw.props.value).toBe(false);
    expect(screenText(tree)).toContain("Você está indisponível");
    const acceptBtn = tree.root.findAllByType(Button).find((b) => b.props.title === "Aceitar");
    expect(acceptBtn!.props.disabled).toBe(true);
  });

  it("alternar o switch dispara a mutation com o novo estado", () => {
    mockState.isAvailable = false;
    const tree = render(<HomeScreen />);
    const sw = tree.root.findByType(Switch);
    act(() => sw.props.onValueChange(true));
    expect(mockSetAvailability).toHaveBeenCalledWith(true);
  });
});
