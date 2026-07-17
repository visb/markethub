import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";
import type { Address } from "@/api/marketplace";

/**
 * Card do livro de endereços (story 71): label + badge "Padrão", rua/nº e
 * cidade/UF, com ações editar, remover e "tornar padrão" (só no não-padrão).
 * Presentacional — confirm de remoção e mutations ficam na tela.
 */
export function AddressCard({
  address,
  onEdit,
  onRemove,
  onMakeDefault,
  busy,
}: {
  address: Address;
  onEdit: () => void;
  onRemove: () => void;
  onMakeDefault: () => void;
  busy?: boolean;
}) {
  return (
    <View style={[styles.card, address.isDefault && styles.cardDefault]}>
      <View style={styles.head}>
        <Ionicons name="location-outline" size={18} color={colors.primary} />
        <Text style={{ fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>
          {address.label}
        </Text>
        {address.isDefault && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Padrão</Text>
          </View>
        )}
      </View>
      <Text muted>
        {address.street}, {address.number}
      </Text>
      <Text variant="caption" muted>
        {address.city}/{address.state}
      </Text>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onEdit} disabled={busy}>
          <Ionicons name="pencil" size={15} color={colors.primary} />
          <Text variant="caption" style={styles.actionText}>
            Editar
          </Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onRemove} disabled={busy}>
          <Ionicons name="trash-outline" size={15} color={colors.danger} />
          <Text variant="caption" style={[styles.actionText, { color: colors.danger }]}>
            Remover
          </Text>
        </Pressable>
        {!address.isDefault && (
          <Pressable style={styles.action} onPress={onMakeDefault} disabled={busy}>
            <Ionicons name="star-outline" size={15} color={colors.primary} />
            <Text variant="caption" style={styles.actionText}>
              Tornar padrão
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardDefault: { borderColor: colors.primary },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  badge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginLeft: "auto",
  },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionText: { color: colors.primary, fontWeight: "600" },
});
