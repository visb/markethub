import React from "react";
import renderer, { act } from "react-test-renderer";
import { ActivityIndicator, TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { ApiClientError } from "@markethub/api-client";
import ProfileScreen from "../../app/account/profile";

/**
 * Story 78: tela "Meus dados" (app/account/profile.tsx). Hooks de useAccount
 * mockados (testados em useAccount.test.tsx); valida orquestração: perfil no
 * form, salvar → updateMe com o diff + toast, erro inline, loading sem perfil.
 */

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../components/Header", () => ({ Header: () => null }));

const mockShow = jest.fn();
jest.mock("../components/Toast", () => ({ useToast: () => ({ show: mockShow }) }));

const ME = { id: "u1", name: "Ana", email: "a@b.com", phone: "41999991234", roles: ["customer"] };
let mockMeData: typeof ME | undefined = ME;
const mockUpdateMutateAsync = jest.fn();
let mockUpdateError: unknown = null;

jest.mock("../api/hooks/useAccount", () => ({
  useMe: () => ({ data: mockMeData }),
  useUpdateMe: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false, error: mockUpdateError }),
}));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ProfileScreen />);
  });
  return tree;
}

function input(tree: renderer.ReactTestRenderer, label: string) {
  return tree.root.findAllByType(TextInput).find((i) => i.props.accessibilityLabel === label)!;
}

function button(tree: renderer.ReactTestRenderer, title: string) {
  return tree.root.findAllByType(Button).find((b) => b.props.title === title)!;
}

beforeEach(() => {
  mockMeData = ME;
  mockUpdateError = null;
  mockShow.mockClear();
  mockUpdateMutateAsync.mockReset().mockResolvedValue({ ...ME, name: "Ana Maria" });
});

describe("ProfileScreen (story 78)", () => {
  it("renderiza o form com o perfil e e-mail read-only", () => {
    const tree = render();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("a@b.com");
    expect(input(tree, "Telefone").props.value).toBe("(41) 99999-1234");
    expect(tree.root.findAllByType(TextInput).some((i) => i.props.value === "a@b.com")).toBe(false);
  });

  it("salvar chama updateMe com o diff e mostra o toast", async () => {
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

  it("erro da mutation aparece inline (body pt-BR da API)", () => {
    mockUpdateError = new ApiClientError(400, { code: "BAD", message: "Telefone já em uso" });
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Telefone já em uso");
  });

  it("erro genérico cai na mensagem padrão", () => {
    mockUpdateError = new Error("qualquer");
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Algo deu errado. Tente novamente.");
  });

  it("sem perfil carregado mostra loading no lugar do form", () => {
    mockMeData = undefined;
    const tree = render();
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(TextInput).length).toBe(0);
  });
});
