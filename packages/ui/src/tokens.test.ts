import { describe, expect, it } from "vitest";
import { colors, radius, spacing, typography } from "./tokens";

/**
 * C29: design tokens do packages/ui (puros, sem React Native). Os componentes
 * (Button/Text/Screen) são wrappers RN finos — render fica para os apps; aqui
 * cobrimos os tokens que alimentam a marca.
 */
describe("tokens", () => {
  it("primary é o vermelho da marca", () => {
    expect(colors.primary).toBe("#E40613");
    expect(colors.accent).toBe(colors.primary);
  });

  it("spacing é uma escala crescente", () => {
    const scale = [spacing.xs, spacing.sm, spacing.md, spacing.lg, spacing.xl, spacing.xxl];
    const sorted = [...scale].sort((a, b) => a - b);
    expect(scale).toEqual(sorted);
    expect(spacing.md).toBe(16);
  });

  it("radius.full é pílula e typography.button é semibold", () => {
    expect(radius.full).toBeGreaterThan(radius.lg);
    expect(typography.button.fontWeight).toBe("600");
    expect(typography.h1.fontSize).toBeGreaterThan(typography.body.fontSize);
  });
});
