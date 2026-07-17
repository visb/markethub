import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type AvailableCoupon } from "@/api/marketplace";
import { useAvailableCoupons } from "@/api/hooks/useAvailableCoupons";

interface Props {
  /** Código do cupom atualmente aplicado ao carrinho (destaca o card). */
  appliedCode: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}

/** Rótulo do desconto do cupom conforme o tipo (story 74). */
function discountLabel(c: AvailableCoupon): string {
  if (c.type === "free_shipping") return "Frete grátis";
  if (c.type === "percent") return `${c.value}% de desconto`;
  return `${brl(c.value)} de desconto`;
}

/**
 * Lista inline de cupons disponíveis no carrinho (story 74). Sem fetch na tela:
 * consome `useAvailableCoupons`. Aplicável → toque aplica; "quase-lá" →
 * desabilitado com quanto falta; aplicado → destacado com ação de remover.
 */
export function AvailableCouponsList({ appliedCode, onApply, onRemove }: Props) {
  const { coupons, loading } = useAvailableCoupons();
  if (loading || coupons.length === 0) return null;

  return (
    <View style={styles.wrap} testID="available-coupons">
      <Text variant="caption" muted style={styles.heading}>
        Cupons disponíveis
      </Text>
      {coupons.map((c) => {
        const applied = c.code === appliedCode;
        const disabled = !c.applicable && !applied;
        return (
          <Pressable
            key={c.code}
            testID={`coupon-${c.code}`}
            disabled={disabled || applied}
            onPress={() => onApply(c.code)}
            style={[styles.card, applied && styles.cardApplied, disabled && styles.cardDisabled]}
          >
            <Ionicons
              name={applied ? "pricetag" : "pricetag-outline"}
              size={18}
              color={applied ? colors.success : disabled ? colors.textMuted : colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, disabled && styles.mutedText]}>{c.title ?? c.code}</Text>
              {c.description ? (
                <Text variant="caption" muted numberOfLines={2}>
                  {c.description}
                </Text>
              ) : null}
              <Text variant="caption" style={[styles.discount, disabled && styles.mutedText]}>
                {discountLabel(c)}
              </Text>
              {disabled && c.reason ? (
                <Text variant="caption" style={styles.missing} testID={`coupon-${c.code}-missing`}>
                  Faltam {brl(c.reason.missingCents)} para usar
                </Text>
              ) : null}
            </View>
            {applied ? (
              <Pressable
                hitSlop={8}
                testID={`coupon-${c.code}-remove`}
                onPress={onRemove}
                style={styles.removeBtn}
              >
                <Text variant="caption" style={styles.removeText}>
                  Remover
                </Text>
              </Pressable>
            ) : (
              <Text variant="caption" style={[styles.action, disabled && styles.mutedText]}>
                {disabled ? "" : "Aplicar"}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  heading: { paddingHorizontal: spacing.xs, fontWeight: "700" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardApplied: { borderColor: colors.success, backgroundColor: colors.primaryLight },
  cardDisabled: { opacity: 0.6 },
  title: { fontWeight: "700" },
  discount: { color: colors.primary, fontWeight: "700", marginTop: 2 },
  missing: { color: colors.danger, marginTop: 2 },
  mutedText: { color: colors.textMuted },
  action: { color: colors.primary, fontWeight: "700" },
  removeBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  removeText: { color: colors.danger, fontWeight: "700" },
});
