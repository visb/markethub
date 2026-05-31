import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, colors, spacing } from "@markethub/ui";

interface HeaderProps {
  title: string;
  onBack?: () => void;
  showHelp?: boolean;
  showBack?: boolean;
}

/** Cabeçalho das telas: ‹ voltar + TÍTULO vermelho caps + ? ajuda. */
export function Header({ title, onBack, showHelp = true, showBack = true }: HeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      {showBack ? (
        <Pressable hitSlop={10} onPress={onBack ?? (() => router.back())}>
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={{ width: 26 }} />
      )}
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={{ flex: 1 }} />
      {showHelp ? (
        <Ionicons name="help-circle-outline" size={24} color={colors.primary} />
      ) : (
        <View style={{ width: 24 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: { color: colors.primary, fontSize: 18, fontWeight: "700", letterSpacing: 0.5 },
});
