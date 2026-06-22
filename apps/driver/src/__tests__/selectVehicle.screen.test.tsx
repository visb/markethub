import React from "react";
import renderer, { act } from "react-test-renderer";
import { Pressable } from "react-native";
import type { DriverVehicleDTO } from "@markethub/api-client";
import SelectVehicleScreen from "../../app/select-vehicle";
import IndexGate from "../../app/index";

/**
 * Story 15: tela de seleção + gate pós-login. Mocka os hooks de veículo, o
 * auth-context e o expo-router para exercitar render da lista, seleção (dispara
 * mutation + navega) e o gate (sem veículo → /select-vehicle).
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: mockPush,
    canGoBack: () => mockCanGoBack,
  }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text>{`REDIRECT:${href}`}</Text>;
  },
}));

const v1: DriverVehicleDTO = { id: "v1", plate: "ABC1D23", type: "car", description: "Gol" };
const v2: DriverVehicleDTO = { id: "v2", plate: "XYZ4E56", type: "motorcycle", description: null };

const mockMutate = jest.fn();
let mockVehiclesData: DriverVehicleDTO[] = [v1, v2];
let mockCurrentData: DriverVehicleDTO | null = null;
let mockVehiclesLoading = false;
let mockIsPending = false;

jest.mock("../api/hooks/useDriverVehicle", () => ({
  useDriverVehicles: () => ({ data: mockVehiclesData, isLoading: mockVehiclesLoading, isError: false }),
  useCurrentVehicle: () => ({ data: mockCurrentData, isLoading: false }),
  useSelectVehicle: () => ({ mutate: mockMutate, isPending: mockIsPending, variables: undefined }),
}));

let mockAuthUser: { name: string } | null = { name: "Drv" };
jest.mock("@/auth-context", () => ({
  useAuth: () => ({ user: mockAuthUser, loading: false }),
}));

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

beforeEach(() => {
  mockBack.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
  mockMutate.mockReset();
  mockVehiclesData = [v1, v2];
  mockCurrentData = null;
  mockVehiclesLoading = false;
  mockIsPending = false;
  mockCanGoBack = true;
  mockAuthUser = { name: "Drv" };
});

describe("SelectVehicleScreen", () => {
  it("renderiza a lista de veículos da rede", () => {
    const tree = render(<SelectVehicleScreen />);
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("ABC1D23");
    expect(json).toContain("XYZ4E56");
  });

  it("selecionar dispara a mutation com o vehicleId", () => {
    const tree = render(<SelectVehicleScreen />);
    const pressables = tree.root.findAllByType(Pressable);
    // a primeira linha de veículo é o primeiro Pressable
    act(() => pressables[0].props.onPress());
    expect(mockMutate).toHaveBeenCalledWith("v1", expect.anything());
  });

  it("ao concluir a seleção navega de volta para a home", () => {
    mockCanGoBack = false;
    mockMutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    const tree = render(<SelectVehicleScreen />);
    const pressables = tree.root.findAllByType(Pressable);
    act(() => pressables[0].props.onPress());
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });
});

describe("gate pós-login (app/index)", () => {
  it("sem sessão → redireciona para /login", () => {
    mockAuthUser = null;
    const tree = render(<IndexGate />);
    expect(JSON.stringify(tree.toJSON())).toContain("REDIRECT:/login");
  });

  it("autenticado SEM veículo → redireciona para /select-vehicle", () => {
    mockCurrentData = null;
    const tree = render(<IndexGate />);
    expect(JSON.stringify(tree.toJSON())).toContain("REDIRECT:/select-vehicle");
  });

  it("autenticado COM veículo → redireciona para /home", () => {
    mockCurrentData = v1;
    const tree = render(<IndexGate />);
    expect(JSON.stringify(tree.toJSON())).toContain("REDIRECT:/home");
  });
});
