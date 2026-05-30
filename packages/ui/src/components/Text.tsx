import React from "react";
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from "react-native";
import { colors, typography } from "../tokens";

type Variant = keyof typeof typography;

export interface TextProps extends RNTextProps {
  variant?: Variant;
  muted?: boolean;
}

export function Text({ variant = "body", muted, style, ...rest }: TextProps) {
  return (
    <RNText
      style={[
        styles.base,
        typography[variant],
        muted ? { color: colors.textMuted } : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: colors.text },
});
