import React from "react";
import renderer, { act } from "react-test-renderer";
import { TextInput } from "react-native";
import { Button } from "@markethub/ui";
import { ApiClientError } from "@markethub/api-client";
import LoginScreen from "../../app/login";

/**
 * Story 41: tela de login do entregador. Mocka o auth-context (login) e o
 * expo-router. Cobre o submit feliz (autentica → vai pra home) e o caminho de erro
 * (ApiClientError → mensagem do corpo; erro genérico → mensagem padrão). Regressão
 * de comportamento — a tela vive em app/, fora do escopo de cobertura.
 */

const mockLogin = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/auth-context", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

function render(node: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  mockLogin.mockReset();
  mockReplace.mockReset();
});

describe("LoginScreen", () => {
  it("submit com sucesso autentica e navega para a home", async () => {
    mockLogin.mockResolvedValue(undefined);
    const tree = render(<LoginScreen />);
    const inputs = tree.root.findAllByType(TextInput);
    act(() => inputs[0].props.onChangeText("  d@x.com  "));
    act(() => inputs[1].props.onChangeText("pw"));
    const entrar = tree.root.findAllByType(Button).find((b) => b.props.title === "Entrar");
    await act(async () => {
      await entrar!.props.onPress();
    });
    expect(mockLogin).toHaveBeenCalledWith("d@x.com", "pw");
    expect(mockReplace).toHaveBeenCalledWith("/home");
  });

  it("ApiClientError exibe a mensagem do corpo", async () => {
    mockLogin.mockRejectedValue(new ApiClientError(403, { code: "WRONG_APP_ROLE", message: "Sem acesso de driver." }));
    const tree = render(<LoginScreen />);
    const entrar = tree.root.findAllByType(Button).find((b) => b.props.title === "Entrar");
    await act(async () => {
      await entrar!.props.onPress();
    });
    await flush();
    expect(JSON.stringify(tree.toJSON())).toContain("Sem acesso de driver.");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("erro genérico exibe a mensagem padrão", async () => {
    mockLogin.mockRejectedValue(new Error("network"));
    const tree = render(<LoginScreen />);
    const entrar = tree.root.findAllByType(Button).find((b) => b.props.title === "Entrar");
    await act(async () => {
      await entrar!.props.onPress();
    });
    await flush();
    expect(JSON.stringify(tree.toJSON())).toContain("Falha ao entrar");
  });
});
