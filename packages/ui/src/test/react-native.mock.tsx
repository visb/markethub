/**
 * Mock leve de `react-native` para rodar os componentes do pacote sob vitest
 * (ambiente node) com `react-test-renderer`. O RN real não importa fora do
 * Metro/jest-expo; aqui só precisamos das primitivas que os componentes usam.
 *
 * As primitivas viram host components ("View", "Text"...), de modo que
 * `tree.root.findAll(n => n.props.accessibilityRole === "button")` e a inspeção
 * de props/estilos funcionem como nos apps mobile.
 */
import React from "react";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function host(name: string) {
  return function HostComponent({ children, ...props }: AnyProps) {
    return React.createElement(name, props, children);
  };
}

export const View = host("View");
export const Text = host("Text");
export const ActivityIndicator = host("ActivityIndicator");

/**
 * Pressable: resolve `style` quando for função (como o Button faz) para que as
 * ramificações de variante/tamanho/disabled sejam executadas, e respeita
 * `disabled` removendo `onPress` — espelhando o comportamento do RN real.
 */
export function Pressable({
  style,
  disabled,
  onPress,
  children,
  ...rest
}: AnyProps & {
  style?: unknown;
  disabled?: boolean;
  onPress?: (...args: unknown[]) => void;
}) {
  const resolvedStyle =
    typeof style === "function"
      ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false })
      : style;
  return React.createElement(
    "Pressable",
    {
      ...rest,
      disabled,
      onPress: disabled ? undefined : onPress,
      style: resolvedStyle,
    },
    children,
  );
}

export const StyleSheet = {
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  },
  flatten(style: unknown): unknown {
    return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  },
};

export type PressableProps = AnyProps;
export type TextProps = AnyProps;
export type ViewProps = AnyProps;
