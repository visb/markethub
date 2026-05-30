/** Design tokens MarketHub — derivados dos screenshots (verde de marca, PIX, R$). */

export const colors = {
  primary: "#00A859", // verde MarketHub
  primaryDark: "#00824A",
  primaryLight: "#E6F7EF",
  accent: "#FF6B00",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  background: "#FFFFFF",
  surface: "#F7F8FA",
  danger: "#DC2626",
  success: "#16A34A",
  warning: "#F59E0B",
  white: "#FFFFFF",
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
  body: { fontSize: 16, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  button: { fontSize: 16, fontWeight: "600" as const },
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
