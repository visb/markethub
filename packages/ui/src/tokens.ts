/** Design tokens MarketHub — derivados dos screenshots (marca VERMELHA, R$, PIX). */

export const colors = {
  primary: "#E11A2C", // vermelho MarketHub
  primaryDark: "#B5141F",
  primaryLight: "#FDECEE", // fundo claro de seleção
  accent: "#E11A2C",
  text: "#1A1A1A",
  textMuted: "#9AA0A6",
  border: "#ECECEC",
  background: "#FFFFFF",
  surface: "#F7F8FA",
  danger: "#C0182A",
  success: "#16A34A",
  warning: "#F59E0B",
  white: "#FFFFFF",
  strike: "#E11A2C", // preço antigo riscado (vermelho claro)
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 24, fontWeight: "700" as const },
  h2: { fontSize: 20, fontWeight: "700" as const },
  title: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  button: { fontSize: 16, fontWeight: "600" as const },
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
