import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, TextInput } from "react-native";
import { Button } from "@markethub/ui";
import AccountScreen from "../../app/account";

/**
 * Story 70: tela de conta (app/account.tsx) — orquestração. Hooks de useAccount
 * mockados (fetch/mutations testados em useAccount.test.tsx); valida wiring:
 * perfil renderizado, salvar dados → mutation + toast, trocar senha → toast,
 * navegação (Endereços/Sair) e loading sem perfil.
 */

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../components/BottomTabs", () => ({ BottomTabs: () => null }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockLogout = jest.fn();
jest.mock("../auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Ana", email: "a@b.com", phone: null, roles: ["customer"] },
    logout: mockLogout,
  }),
}));

const mockShow = jest.fn();
jest.mock("../components/Toast", () => ({ useToast: () => ({ show: mockShow }) }));

const ME = { id: "u1", name: "Ana", email: "a@b.com", phone: "41999991234", roles: ["customer"] };
let mockMeData: typeof ME | undefined = ME;
const mockUpdateMutateAsync = jest.fn();
const mockPasswordMutateAsync = jest.fn();
let mockUpdateError: unknown = null;
let mockPasswordError: unknown = null;

jest.mock("../api/hooks/useAccount", () => ({
  useMe: () => ({ data: mockMeData }),
  useUpdateMe: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false, error: mockUpdateError }),
  useChangePassword: () => ({
    mutateAsync: mockPasswordMutateAsync,
    isPending: false,
    error: mockPasswordError,
  }),
}));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AccountScreen />);
  });
  return tree;
}

function input(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TextInput).find((i) => i.props.accessibilityLabel === label)!;
}

function button(tree: renderer.ReactTestRenderer, title: string) {
  return tree.root.findAllByType(Button).find((b) => b.props.title === title)!;
}

function pressable(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAll((n) => typeof n.props.onPress === "function")
    .find((n) => contains(n, label))!;
}

function contains(node: renderer.ReactTestInstance, text: string): boolean {
  try {
    return node.findAll((n) => n.props.children === text).length > 0;
  } catch {
    return false;
  }
}

beforeEach(() => {
  mockMeData = ME;
  mockUpdateError = null;
  mockPasswordError = null;
  mockPush.mockClear();
  mockLogout.mockClear();
  mockShow.mockClear();
  mockUpdateMutateAsync.mockReset().mockResolvedValue({ ...ME, name: "Ana Maria" });
  mockPasswordMutateAsync.mockReset().mockResolvedValue({ ok: true, revokedSessions: 1 });
});

describe("AccountScreen (story 70)", () => {
  it("renderiza perfil: nome no header, e-mail read-only e seções", () => {
    const tree = render();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Meus dados");
    expect(json).toContain("Segurança");
    expect(json).toContain("a@b.com");
    expect(input(tree, "Telefone").props.value).toBe("(41) 99999-1234");
    // e-mail nunca vira input editável
    expect(tree.root.findAllByType(TextInput).some((i) => i.props.value === "a@b.com")).toBe(false);
  });

  it("salvar dados: chama updateMe com o diff e mostra o toast", async () => {
    const tree = render();
    act(() => input(tree, "Nome").props.onChangeText("Ana Maria"));
    await act(async () => {
      button(tree, "Salvar alterações").props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({ name: "Ana Maria" });
    expect(mockShow).toHaveBeenCalledWith("Dados atualizados ✓");
  });

  it("erro no salvar não mostra toast (fica inline no form)", async () => {
    mockUpdateMutateAsync.mockRejectedValueOnce(new Error("boom"));
    const tree = render();
    act(() => input(tree, "Nome").props.onChangeText("Ana Maria"));
    await act(async () => {
      button(tree, "Salvar alterações").props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("trocar senha: chama a mutation e mostra o toast de sucesso", async () => {
    const tree = render();
    act(() => input(tree, "Senha atual").props.onChangeText("atual123"));
    act(() => input(tree, "Nova senha").props.onChangeText("nova-senha-1"));
    act(() => input(tree, "Confirmar nova senha").props.onChangeText("nova-senha-1"));
    await act(async () => {
      button(tree, "Alterar senha").props.onPress();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(mockPasswordMutateAsync).toHaveBeenCalledWith({
      currentPassword: "atual123",
      newPassword: "nova-senha-1",
    });
    expect(mockShow).toHaveBeenCalledWith("Senha alterada ✓");
  });

  it("erro de mutation aparece na tela (ex.: senha atual incorreta)", () => {
    mockPasswordError = new Error("qualquer");
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Algo deu errado. Tente novamente.");
  });

  it("sem perfil carregado mostra loading no lugar do form de dados", () => {
    mockMeData = undefined;
    const tree = render();
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    // form de senha continua disponível
    expect(button(tree, "Alterar senha")).toBeTruthy();
  });

  it("Endereços navega e Sair desloga", () => {
    const tree = render();
    act(() => pressable(tree, "Endereços").props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/addresses");
    act(() => pressable(tree, "Sair").props.onPress());
    expect(mockLogout).toHaveBeenCalled();
  });
});
