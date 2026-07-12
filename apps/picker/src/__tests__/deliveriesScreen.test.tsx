import React from "react";
import { ActivityIndicator, Pressable } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Button, Text } from "@markethub/ui";
import { ApiClientError, type DeliveryDTO, type StoreDriverDTO } from "@markethub/api-client";
import DeliveriesScreen from "../../app/deliveries";

/**
 * Story 62: comportamento da tela de despacho (app/deliveries.tsx). A tela vive em
 * app/ — fora do collectCoverageFrom (só src/ conta no agregado), logo é regressão
 * de comportamento por render. Cobre o badge de disponibilidade do entregador, o
 * item desabilitado quando indisponível e o toast + refetch na corrida
 * (DRIVER_UNAVAILABLE) ao atribuir alguém que ficou fora de turno.
 */

const mockAssignMutate = jest.fn();
const mockRefetchDrivers = jest.fn();

const mockState = {
  deliveries: [] as DeliveryDTO[],
  drivers: [] as StoreDriverDTO[],
  deliveriesLoading: false,
  anyError: false,
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ storeId: "s1" }),
  Stack: { Screen: () => null },
}));

jest.mock("@/api/hooks/useStoreDeliveries", () => ({
  useStoreDeliveries: () => ({
    data: mockState.deliveries,
    isLoading: mockState.deliveriesLoading,
    isError: mockState.anyError,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useStoreDrivers: () => ({ data: mockState.drivers, refetch: mockRefetchDrivers }),
  useDeliveryActions: () => ({
    assign: { mutate: mockAssignMutate, isPending: false, isError: false },
    unassign: { mutate: jest.fn(), isPending: false, isError: false },
    retry: { mutate: jest.fn(), isPending: false, isError: false },
    cancel: { mutate: jest.fn(), isPending: false, isError: false },
  }),
}));

function mkDelivery(over: Partial<DeliveryDTO> = {}): DeliveryDTO {
  return {
    id: "d1",
    orderGroupId: "g1",
    orderId: "order-000123",
    status: "unassigned",
    storeId: "s1",
    storeName: "Loja 1",
    customerName: "Cliente",
    itemCount: 2,
    ...over,
  };
}

function mkDriver(over: Partial<StoreDriverDTO> = {}): StoreDriverDTO {
  return { id: "drv1", name: "Ana", activeDeliveries: 0, available: true, availableSince: null, ...over };
}

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

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
  mockAssignMutate.mockReset();
  mockRefetchDrivers.mockReset();
  mockState.deliveries = [mkDelivery()];
  mockState.drivers = [];
  mockState.deliveriesLoading = false;
  mockState.anyError = false;
});

describe("DeliveriesScreen (despacho — story 62)", () => {
  it("mostra o spinner enquanto carrega", () => {
    mockState.deliveriesLoading = true;
    const tree = render(<DeliveriesScreen />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
  });

  it("badge disponível/indisponível por entregador ao expandir a atribuição", () => {
    mockState.drivers = [
      mkDriver({ id: "a", name: "Ana", available: true }),
      mkDriver({ id: "b", name: "Beto", available: false }),
    ];
    const tree = render(<DeliveriesScreen />);
    // abre a lista de entregadores
    const assignBtn = tree.root.findAllByType(Button).find((b) => b.props.title === "Atribuir entregador");
    act(() => assignBtn!.props.onPress());
    const text = screenText(tree);
    expect(text).toContain("Disponível");
    expect(text).toContain("Indisponível");
  });

  it("desabilita o entregador indisponível (Pressable disabled)", () => {
    mockState.drivers = [mkDriver({ id: "b", name: "Beto", available: false })];
    const tree = render(<DeliveriesScreen />);
    const assignBtn = tree.root.findAllByType(Button).find((b) => b.props.title === "Atribuir entregador");
    act(() => assignBtn!.props.onPress());
    const row = tree.root
      .findAllByType(Pressable)
      .find((p) => p.findAllByType(Text).some((t) => String(t.props.children).includes("Beto")));
    expect(row!.props.disabled).toBe(true);
  });

  it("corrida DRIVER_UNAVAILABLE: mostra toast + refetch dos entregadores", () => {
    mockState.drivers = [mkDriver({ id: "a", name: "Ana", available: true })];
    // simula o backend recusando (ficou indisponível entre load e clique)
    mockAssignMutate.mockImplementation((_vars, opts) => {
      opts.onError(new ApiClientError(400, { code: "DRIVER_UNAVAILABLE", message: "indisponível" }));
    });
    const tree = render(<DeliveriesScreen />);
    const assignBtn = tree.root.findAllByType(Button).find((b) => b.props.title === "Atribuir entregador");
    act(() => assignBtn!.props.onPress());
    const row = tree.root
      .findAllByType(Pressable)
      .find((p) => p.findAllByType(Text).some((t) => String(t.props.children).includes("Ana")));
    act(() => row!.props.onPress());
    expect(mockRefetchDrivers).toHaveBeenCalled();
    expect(screenText(tree)).toContain("Entregador ficou indisponível");
  });

  it("erro genérico na atribuição mostra toast de falha (sem refetch de corrida)", () => {
    mockState.drivers = [mkDriver({ id: "a", name: "Ana", available: true })];
    mockAssignMutate.mockImplementation((_vars, opts) => {
      opts.onError(new ApiClientError(500, { code: "OOPS", message: "boom" }));
    });
    const tree = render(<DeliveriesScreen />);
    const assignBtn = tree.root.findAllByType(Button).find((b) => b.props.title === "Atribuir entregador");
    act(() => assignBtn!.props.onPress());
    const row = tree.root
      .findAllByType(Pressable)
      .find((p) => p.findAllByType(Text).some((t) => String(t.props.children).includes("Ana")));
    act(() => row!.props.onPress());
    expect(mockRefetchDrivers).not.toHaveBeenCalled();
    expect(screenText(tree)).toContain("Não foi possível atribuir");
  });
});
