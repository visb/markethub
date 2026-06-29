import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";

interface FollowButtonProps {
  /** Estado seguido/não-seguido — controla o ícone (heart vs heart-outline). */
  following: boolean;
  onPress: () => void;
}

/**
 * Pílula vermelha "♡ Seguir" do AppBar da página da loja (story 33).
 * Coração + texto brancos sobre fundo `colors.primary`, conforme o screenshot
 * `briefing/screenshots/marketplace/Merchant Home.jpg`. O wiring do estado real
 * (toggle/persistência) é a story 34 — aqui o onPress vem da tela.
 */
export function FollowButton({ following, onPress }: FollowButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={following ? "Deixar de seguir" : "Seguir"}
      hitSlop={8}
      onPress={onPress}
      style={styles.pill}
    >
      <Ionicons name={following ? "heart" : "heart-outline"} size={16} color={colors.white} />
      <Text style={styles.label}>Seguir</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: { color: colors.white, fontSize: 14, fontWeight: "700" },
});
