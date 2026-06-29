import React from "react";
import renderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { colors } from "../tokens";
import { Button, type ButtonProps } from "./Button";

/**
 * Story 36: cobertura do Button RN compartilhado. Renderiza com react-test-renderer
 * (react-native aliasado para mock leve em vitest.config). Cobre render do título,
 * as variantes, tamanhos, estado loading e o disabled (que NÃO dispara onPress).
 */

function render(props: ButtonProps) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Button {...props} />);
  });
  return tree;
}

// elemento host (não a instância do componente-função do mock), onde o style já
// foi resolvido e o onPress reflete o disabled.
function button(tree: renderer.ReactTestRenderer) {
  return tree.root.findByType("Pressable" as never);
}

describe("Button (story 36)", () => {
  it("renderiza o título", () => {
    const tree = render({ title: "Comprar" });
    const text = tree.root.findByType("Text" as never);
    expect(text.props.children).toBe("Comprar");
  });

  it("variante primary usa o vermelho de fundo e label branco", () => {
    const tree = render({ title: "Pagar", variant: "primary" });
    const text = tree.root.findByType("Text" as never);
    // segundo item do array de estilo do label é { color }
    expect(text.props.style).toContainEqual({ color: colors.white });
    const style = button(tree).props.style as Array<Record<string, unknown> | false>;
    expect(style).toContainEqual({ backgroundColor: colors.primary });
  });

  it("variantes não-primary usam o vermelho como cor do label", () => {
    for (const variant of ["outline", "secondary", "ghost"] as const) {
      const tree = render({ title: "X", variant });
      const text = tree.root.findByType("Text" as never);
      expect(text.props.style).toContainEqual({ color: colors.primary });
    }
  });

  it("tamanho sm aplica o estilo compacto", () => {
    const tree = render({ title: "X", size: "sm" });
    const style = button(tree).props.style as Array<unknown>;
    // sm injeta um objeto de altura reduzida (40)
    expect(style.some((s) => s && (s as { height?: number }).height === 40)).toBe(true);
  });

  it("loading mostra o ActivityIndicator no lugar do texto", () => {
    const tree = render({ title: "Enviando", loading: true });
    expect(tree.root.findAllByType("ActivityIndicator" as never)).toHaveLength(1);
    expect(tree.root.findAllByType("Text" as never)).toHaveLength(0);
  });

  it("onPress dispara ao tocar quando habilitado", () => {
    const onPress = vi.fn();
    const tree = render({ title: "Ok", onPress });
    act(() => button(tree).props.onPress?.());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("disabled NÃO dispara onPress", () => {
    const onPress = vi.fn();
    const tree = render({ title: "Ok", onPress, disabled: true });
    const btn = button(tree);
    expect(btn.props.disabled).toBe(true);
    act(() => btn.props.onPress?.());
    expect(onPress).not.toHaveBeenCalled();
  });

  it("loading também desabilita (não dispara onPress)", () => {
    const onPress = vi.fn();
    const tree = render({ title: "Ok", onPress, loading: true });
    const btn = button(tree);
    expect(btn.props.disabled).toBe(true);
    act(() => btn.props.onPress?.());
    expect(onPress).not.toHaveBeenCalled();
  });

  it("respeita style como função (mescla com os estilos internos)", () => {
    const extra = { marginTop: 7 };
    const tree = render({ title: "X", style: () => extra });
    const style = button(tree).props.style as Array<unknown>;
    expect(style).toContainEqual(extra);
  });

  it("respeita style como objeto", () => {
    const extra = { marginBottom: 9 };
    const tree = render({ title: "X", style: extra });
    const style = button(tree).props.style as Array<unknown>;
    expect(style).toContainEqual(extra);
  });
});
