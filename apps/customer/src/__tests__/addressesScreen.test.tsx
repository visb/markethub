import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, Alert, Pressable } from "react-native";
import { Button } from "@markethub/ui";
import AddressBookScreen from "../../app/addresses";
import type { Address } from "../api/marketplace";

/**
 * Story 71: livro de endereços (app/addresses.tsx) — orquestração. Hooks de
 * useAddresses mockados (fetch/mutations testados em useAddresses.test.tsx);
 * valida wiring: cards com badge "Padrão", editar → /address/[id], remover com
 * confirm (Alert), tornar padrão, estado vazio com CTA e loading.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

let mockList: Address[] = [];
let mockLoading = false;
const mockRemove = jest.fn();
const mockSetDefault = jest.fn();
jest.mock("../api/hooks/useAddresses", () => ({
  useAddresses: () => ({ addresses: mockList, activeAddress: mockList[0] ?? null, loading: mockLoading }),
  useRemoveAddress: () => ({ mutate: mockRemove, isPending: false }),
  useSetDefaultAddress: () => ({ mutate: mockSetDefault, isPending: false }),
}));

function addr(over: Partial<Address>): Address {
  return {
    id: "a1", label: "Casa", street: "Rua A", number: "10", city: "Curitiba", state: "PR",
    zipCode: "80000-000", latitude: -25, longitude: -49, isDefault: false, ...over,
  };
}

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AddressBookScreen />);
  });
  return tree;
}

function json(tree: renderer.ReactTestRenderer) {
  return JSON.stringify(tree.toJSON());
}

/** Pressables que contêm o texto — na ordem dos cards. */
function pressables(tree: renderer.ReactTestRenderer, text: string) {
  return tree.root
    .findAllByType(Pressable)
    .filter((n) => n.findAll((c) => c.props.children === text).length > 0);
}

function button(tree: renderer.ReactTestRenderer, title: string) {
  return tree.root.findAllByType(Button).find((b) => b.props.title === title)!;
}

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  mockLoading = false;
  mockList = [
    addr({ id: "a1", label: "Casa", isDefault: true }),
    addr({ id: "a2", label: "Trabalho", street: "Rua B", number: "22" }),
  ];
  mockPush.mockClear();
  mockRemove.mockClear();
  mockSetDefault.mockClear();
  alertSpy.mockClear();
});

describe("AddressBookScreen (story 71)", () => {
  it("lista os cards com label, rua/nº, cidade e badge Padrão só no default", () => {
    const tree = render();
    const j = json(tree);
    expect(j).toContain("Casa");
    expect(j).toContain("Trabalho");
    expect(j).toContain("Rua B");
    expect(j).toContain("Curitiba");
    // um único badge (do default)
    expect(j.split("Padrão").length - 1).toBe(1);
    // "Tornar padrão" só aparece no card não-padrão
    expect(pressables(tree, "Tornar padrão")).toHaveLength(1);
  });

  it("sem endereço default nenhum badge é exibido (backend não promove após delete)", () => {
    mockList = [addr({ id: "a2", label: "Trabalho", isDefault: false })];
    const tree = render();
    expect(json(tree)).not.toContain("Padrão");
  });

  it("editar navega para /address/[id]", () => {
    const tree = render();
    act(() => pressables(tree, "Editar")[1].props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/address/a2");
  });

  it("remover pede confirm; confirmar dispara a mutation, cancelar não", () => {
    const tree = render();
    act(() => pressables(tree, "Remover")[0].props.onPress());
    expect(alertSpy).toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2]!;
    // [Cancelar, Remover]
    expect(buttons[0].text).toBe("Cancelar");
    act(() => buttons[1].onPress!());
    expect(mockRemove).toHaveBeenCalledWith("a1");
  });

  it("tornar padrão dispara a mutation com o id do card", () => {
    const tree = render();
    act(() => pressables(tree, "Tornar padrão")[0].props.onPress());
    expect(mockSetDefault).toHaveBeenCalledWith("a2");
  });

  it("+ Novo endereço navega para /address/new", () => {
    const tree = render();
    act(() => button(tree, "+ Novo endereço").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/address/new");
  });

  it("estado vazio mostra CTA de primeiro endereço", () => {
    mockList = [];
    const tree = render();
    expect(json(tree)).toContain("Nenhum endereço ainda");
    act(() => button(tree, "Cadastrar primeiro endereço").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/address/new");
  });

  it("loading mostra o spinner", () => {
    mockLoading = true;
    mockList = [];
    const tree = render();
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });
});
