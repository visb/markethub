import React from "react";
import renderer, { act } from "react-test-renderer";
import { FollowButton } from "../components/FollowButton";

/**
 * Story 33: pílula "♡ Seguir" do AppBar da página da loja. Valida o rótulo, o
 * ícone conforme o estado (heart-outline quando não-seguido, heart quando
 * seguido) e que tocar dispara o onPress (o wiring do estado real é a story 34).
 */

// Ionicons: stub que materializa o `name` como texto, para assertir o coração.
jest.mock("@expo/vector-icons", () => {
  const ReactMock = require("react");
  const { Text: RNText } = require("react-native");
  return { Ionicons: ({ name }: { name: string }) => ReactMock.createElement(RNText, null, name) };
});

function json(tree: renderer.ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

function render(props: React.ComponentProps<typeof FollowButton>) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<FollowButton {...props} />);
  });
  return tree;
}

describe("FollowButton (story 33)", () => {
  it("mostra o rótulo 'Seguir' e o coração vazio quando não-seguido", () => {
    const t = json(render({ following: false, onPress: jest.fn() }));
    expect(t).toContain("Seguir");
    expect(t).toContain("heart-outline");
  });

  it("usa o coração cheio quando seguido", () => {
    const t = json(render({ following: true, onPress: jest.fn() }));
    expect(t).toContain("heart");
    expect(t).not.toContain("heart-outline");
  });

  it("tocar dispara o onPress", () => {
    const onPress = jest.fn();
    const tree = render({ following: false, onPress });
    const btn = tree.root.findAll((n) => n.props.accessibilityRole === "button")[0];
    act(() => {
      btn.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
