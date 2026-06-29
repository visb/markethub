import React from "react";
import renderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { spacing } from "../tokens";
import { Screen, type ScreenProps } from "./Screen";

/**
 * Story 36: cobertura do Screen RN compartilhado — wrapper SafeAreaView + View,
 * padding por padrão e o modo sem padding.
 */

function render(props: ScreenProps) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Screen {...props} />);
  });
  return tree;
}

describe("Screen (story 36)", () => {
  it("envolve os filhos num SafeAreaView", () => {
    const tree = render({ children: <></> });
    expect(tree.root.findAllByType("SafeAreaView" as never)).toHaveLength(1);
  });

  it("renderiza os filhos dentro do container", () => {
    const tree = render({ children: <></> });
    const view = tree.root.findByType("View" as never);
    expect(view).toBeTruthy();
  });

  it("aplica padding por padrão", () => {
    const tree = render({ children: <></> });
    const view = tree.root.findByType("View" as never);
    const style = view.props.style as Array<unknown>;
    expect(style.some((s) => s && (s as { padding?: number }).padding === spacing.lg)).toBe(true);
  });

  it("padded=false não aplica padding", () => {
    const tree = render({ padded: false, children: <></> });
    const view = tree.root.findByType("View" as never);
    const style = view.props.style as Array<unknown>;
    expect(style.some((s) => s && (s as { padding?: number }).padding === spacing.lg)).toBe(false);
  });

  it("mescla style externo", () => {
    const extra = { gap: 11 };
    const tree = render({ children: <></>, style: extra });
    const view = tree.root.findByType("View" as never);
    expect(view.props.style as Array<unknown>).toContainEqual(extra);
  });
});
