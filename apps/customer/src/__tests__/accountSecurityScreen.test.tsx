import React from "react";
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { ApiClientError } from "@markethub/api-client";
import SecurityScreen from "../../app/account/security";

/**
 * Story 78: tela "Segurança" (app/account/security.tsx). Hook useChangePassword
 * mockado; valida orquestração: trocar senha → mutation + toast de sucesso, e
 * erro da API exibido inline no form.
 */

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../components/Header", () => ({ Header: () => null }));

const mockShow = jest.fn();
jest.mock("../components/Toast", () => ({ useToast: () => ({ show: mockShow }) }));

const mockPasswordMutateAsync = jest.fn();
let mockPasswordError: unknown = null;

jest.mock("../api/hooks/useAccount", () => ({
  useChangePassword: () => ({
    mutateAsync: mockPasswordMutateAsync,
    isPending: false,
    error: mockPasswordError,
  }),
}));

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SecurityScreen />);
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
  mockPasswordError = null;
  mockShow.mockClear();
  mockPasswordMutateAsync.mockReset().mockResolvedValue({ ok: true, revokedSessions: 1 });
});

describe("SecurityScreen (story 78)", () => {
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

  it("erro da API aparece inline no form (body pt-BR)", () => {
    mockPasswordError = new ApiClientError(400, {
      code: "INVALID_PASSWORD",
      message: "Senha atual incorreta",
    });
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Senha atual incorreta");
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("erro genérico cai na mensagem padrão", () => {
    mockPasswordError = new Error("qualquer");
    const tree = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Algo deu errado. Tente novamente.");
  });
});
