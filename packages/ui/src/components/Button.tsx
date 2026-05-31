import React from "react";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radius, spacing, typography } from "../tokens";

export interface ButtonProps extends Omit<PressableProps, "children"> {
  title: string;
  /** primary = vermelho sólido; outline = branco c/ borda vermelha (CTA full-width das telas). */
  variant?: "primary" | "outline" | "secondary" | "ghost";
  loading?: boolean;
  size?: "md" | "sm";
}

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  size = "md",
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor = variant === "primary" ? colors.white : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        size === "sm" && styles.sm,
        variant === "primary" && styles.primary,
        variant === "outline" && styles.outline,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        isDisabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <Text style={[styles.label, { color: labelColor }]}>{title}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.md,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  sm: { height: 40, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary },
  secondary: { backgroundColor: colors.primaryLight },
  ghost: { backgroundColor: "transparent" },
  disabled: { opacity: 0.5 },
  content: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  label: { ...typography.button },
});
