import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@markethub/ui";

/**
 * Overlay de loading do explore (story 06, faceta 4): card flutuante no rodapé
 * sobre o mapa ("Procurando mercados nesta área…" + indicador) — **não** um
 * spinner que cobre o mapa inteiro (espelha briefing/.../Home - Searching
 * Routes.jpg). Renderizado pela tela enquanto a query do viewport está fetching;
 * posicionado absoluto acima do `BottomTabs`.
 */
export function MapLoadingBadge() {
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityRole="alert">
      <View style={styles.card}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.label}>Procurando mercados nesta área…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
});
