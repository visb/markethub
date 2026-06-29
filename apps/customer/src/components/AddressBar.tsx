import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";
import type { Address } from "@/api/marketplace";

/** "Rua, número" do endereço ativo; cai no label quando não há rua/número. */
export function addressLine(address: Address): string {
  const line = [address.street, address.number].filter(Boolean).join(", ");
  return line || address.label;
}

/**
 * Barra de endereço da aba Explorar (ref: Explorar.jpg): pill flutuante sobre o
 * mapa. Com endereço ativo → "Minha localização atual" + rua/número + lápis para
 * editar; sem endereço → CTA "Definir endereço" com "+". Não busca nada: recebe o
 * endereço ativo (do ViewModel) e um `onPress` que leva ao picker `/delivery`.
 */
export function AddressBar({
  address,
  onPress,
}: {
  address: Address | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.pill}
      >
        <Ionicons
          name={address ? "location" : "add-circle-outline"}
          size={20}
          color={colors.primary}
        />
        {address ? (
          <View style={styles.texts}>
            <Text style={styles.label}>Minha localização atual</Text>
            <Text style={styles.value} numberOfLines={1}>
              {addressLine(address)}
            </Text>
          </View>
        ) : (
          <View style={styles.texts}>
            <Text style={styles.cta}>Definir endereço</Text>
          </View>
        )}
        {address ? (
          <Ionicons name="pencil" size={18} color={colors.textMuted} />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  texts: { flex: 1 },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  value: { fontSize: 15, color: colors.text, fontWeight: "700" },
  cta: { fontSize: 15, color: colors.text, fontWeight: "700" },
});
