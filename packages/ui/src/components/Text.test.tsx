import React from "react";
import renderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { colors, typography } from "../tokens";
import { Text, type TextProps } from "./Text";

/**
 * Story 36: cobertura do Text RN compartilhado — render dos filhos, variante de
 * tipografia, modo `muted` e merge de style externo.
 */

function render(props: TextProps) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Text {...props} />);
  });
  return tree.root.findByType("Text" as never);
}

describe("Text (story 36)", () => {
  it("renderiza os filhos", () => {
    const node = render({ children: "Olá" });
    expect(node.props.children).toBe("Olá");
  });

  it("usa a variante body por padrão", () => {
    const node = render({ children: "x" });
    expect(node.props.style).toContainEqual(typography.body);
  });

  it("aplica a variante de tipografia pedida", () => {
    const node = render({ children: "x", variant: "h1" });
    expect(node.props.style).toContainEqual(typography.h1);
  });

  it("muted aplica a cor textMuted", () => {
    const node = render({ children: "x", muted: true });
    expect(node.props.style).toContainEqual({ color: colors.textMuted });
  });

  it("sem muted não injeta a cor textMuted", () => {
    const node = render({ children: "x" });
    expect(node.props.style).toContain(null);
  });

  it("mescla style externo", () => {
    const extra = { letterSpacing: 2 };
    const node = render({ children: "x", style: extra });
    expect(node.props.style).toContainEqual(extra);
  });
});
