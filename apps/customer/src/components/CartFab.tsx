import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { brl } from "@/api/marketplace";

/**
 * FAB do carrinho (ref: Merchant Home.jpg): círculo branco com borda e ícone
 * vermelhos + selo do subtotal abaixo.
 */
export function CartFab({ totalCents, onPress }: { totalCents: number; onPress: () => void }) {
  if (totalCents <= 0) return null;
  return (
    <Pressable style={styles.wrap} onPress={onPress}>
      <View style={styles.circle}>
        <Ionicons name="cart-outline" size={28} color={colors.primary} />
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{brl(totalCents)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: spacing.lg, bottom: 84, alignItems: "center" },
  circle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pill: {
    marginTop: -8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    elevation: 4,
  },
  pillText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
