/**
 * Mock leve de `react-native-safe-area-context` para os testes do pacote sob
 * vitest. O `Screen` usa apenas `SafeAreaView` como wrapper.
 */
import React from "react";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

export function SafeAreaView({ children, ...props }: AnyProps) {
  return React.createElement("SafeAreaView", props, children);
}
