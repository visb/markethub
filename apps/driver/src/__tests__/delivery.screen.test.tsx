import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, TextInput } from "react-native";
import { Button } from "@markethub/ui";
import type { DeliveryDTO } from "@markethub/api-client";
import DeliveryScreen from "../../app/delivery/[id]";

/**
 * Story 41: tela de detalhe da entrega. Mocka os hooks de dados (React Query) e o
 * expo-router. Cobre estados (carregando / indisponível / entregue) e as ações de
 * avançar status (confirmar coleta e confirmar entrega). Regressão de comportamento
 * — a tela vive em app/, fora do escopo de cobertura.
 */

const mockReplace = jest.fn();
const mockPickupMutate = jest.fn();
const mockDeliverMutate = jest.fn();

const mockState = {
  detail: { data: null as DeliveryDTO | null, isLoading: false, isError: false },
  pickup: { isPending: false, isError: false },
  deliver: { isPending: false, isError: false },
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "d1" }),
  useRouter: () => ({ replace: mockReplace }),
  Stack: { Screen: () => null },
}));

jest.mock("@/api/hooks/useDriverDeliveries", () => ({
  useDeliveryDetail: () => mockState.detail,
  useConfirmPickup: () => ({ mutate: mockPickupMutate, ...mockState.pickup }),
  useConfirmDelivery: () => ({ mutate: mockDeliverMutate, ...mockState.deliver }),
}));

// Rastreio ao vivo (story 51): isolado do teste da tela (device/auth próprios).
let mockTrackingPermissionDenied = false;
jest.mock("@/hooks/useDeliveryTracking", () => ({
  useDeliveryTracking: () => ({ permissionDenied: mockTrackingPermissionDenied }),
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

beforeEach(() => {
  mockReplace.mockReset();
  mockPickupMutate.mockReset();
  mockDeliverMutate.mockReset();
  mockState.detail = { data: null, isLoading: false, isError: false };
  mockState.pickup = { isPending: false, isError: false };
  mockState.deliver = { isPending: false, isError: false };
  mockTrackingPermissionDenied = false;
});

describe("DeliveryScreen", () => {
  it("mostra o spinner enquanto carrega", () => {
    mockState.detail = { data: null, isLoading: true, isError: false };
    const tree = render(<DeliveryScreen />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
  });

  it("entrega indisponível: mostra aviso e Voltar leva à home", () => {
    mockState.detail = { data: null, isLoading: false, isError: false };
    const tree = render(<DeliveryScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain("concluída ou indisponível");
    const voltar = tree.root.findAllByType(Button).find((b) => b.props.title === "Voltar");
    act(() => voltar!.props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("status assigned: confirma coleta com o código digitado", () => {
    mockState.detail = { data: mkDelivery({ status: "assigned" }), isLoading: false, isError: false };
    const tree = render(<DeliveryScreen />);
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText("PC1"));
    const btn = tree.root.findAllByType(Button).find((b) => b.props.title === "Confirmar coleta");
    expect(btn!.props.disabled).toBe(false);
    act(() => btn!.props.onPress());
    expect(mockPickupMutate).toHaveBeenCalledWith("PC1");
  });

  it("status picked_up: confirma entrega com o código digitado", () => {
    mockState.detail = { data: mkDelivery({ status: "picked_up" }), isLoading: false, isError: false };
    const tree = render(<DeliveryScreen />);
    const input = tree.root.findByType(TextInput);
    act(() => input.props.onChangeText("DC1"));
    const btn = tree.root.findAllByType(Button).find((b) => b.props.title === "Confirmar entrega");
    act(() => btn!.props.onPress());
    expect(mockDeliverMutate).toHaveBeenCalledWith("DC1");
  });

  it("código vazio mantém a ação desabilitada", () => {
    mockState.detail = { data: mkDelivery({ status: "assigned" }), isLoading: false, isError: false };
    const tree = render(<DeliveryScreen />);
    const btn = tree.root.findAllByType(Button).find((b) => b.props.title === "Confirmar coleta");
    expect(btn!.props.disabled).toBe(true);
  });

  it("status delivered: mostra a confirmação de entrega", () => {
    mockState.detail = { data: mkDelivery({ status: "delivered" }), isLoading: false, isError: false };
    const tree = render(<DeliveryScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain("Entregue");
  });

  it("erro com entrega carregada mostra a mensagem", () => {
    mockState.detail = { data: mkDelivery({ status: "assigned" }), isLoading: false, isError: true };
    const tree = render(<DeliveryScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain("Falha ao carregar a entrega");
  });

  it("picked_up + permissão de rastreio negada: mostra o banner", () => {
    mockTrackingPermissionDenied = true;
    mockState.detail = { data: mkDelivery({ status: "picked_up" }), isLoading: false, isError: false };
    const tree = render(<DeliveryScreen />);
    expect(JSON.stringify(tree.toJSON())).toContain("Rastreio ao vivo indisponível");
  });
});
