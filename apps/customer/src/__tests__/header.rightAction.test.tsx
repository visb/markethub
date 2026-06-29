import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Header } from "../components/Header";

/**
 * Story 33: o `Header` ganha a prop opcional `rightAction`. Quando presente,
 * ela substitui o ícone de ajuda "?" (usado pelo botão "Seguir" da página da
 * loja). Sem `rightAction`, o comportamento padrão (showHelp → "?") segue
 * intacto — regressão das telas existentes que usam o "?".
 */

// expo-router: só `useRouter` (botão voltar). Sem navegação real no teste.
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

// Ionicons: stub que materializa o `name` como texto, para assertir o "?".
jest.mock("@expo/vector-icons", () => {
  const ReactMock = require("react");
  const { Text: RNText } = require("react-native");
  return { Ionicons: ({ name }: { name: string }) => ReactMock.createElement(RNText, null, name) };
});

function json(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function render(props: React.ComponentProps<typeof Header>) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Header {...props} />);
  });
  return tree;
}

describe("Header — rightAction (story 33)", () => {
  it("com rightAction renderiza a ação e NÃO mostra o '?'", () => {
    const t = json(render({ title: "", rightAction: <Text>Seguir</Text> }));
    expect(t).toContain("Seguir");
    expect(t).not.toContain("help-circle-outline");
  });

  it("sem rightAction mantém o '?' (regressão das telas existentes)", () => {
    const t = json(render({ title: "Catálogo" }));
    expect(t).toContain("help-circle-outline");
    expect(t).not.toContain("Seguir");
  });

  it("showHelp={false} sem rightAction não mostra o '?'", () => {
    const t = json(render({ title: "X", showHelp: false }));
    expect(t).not.toContain("help-circle-outline");
  });
});
