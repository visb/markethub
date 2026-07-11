import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type ProductView } from "@/api/marketplace";
import { MerchantLogo } from "./MerchantLogo";
import { QtyStepper } from "./QtyStepper";

interface MerchantHeader {
  merchant: string;
  logoUrl?: string | null;
  eta: string;
  distanceKm: number | null;
  deliveryFeeCents: number;
}

interface ProductCardProps {
  product: ProductView;
  /** Cabeçalho com mercado (home do marketplace multi-loja). */
  header?: MerchantHeader;
  /** Quantidade atual no carrinho (unidades) ou gramas; null = não está. */
  cartLabel?: string | null;
  /** Loja fechada agora (story 52) → selo discreto "Fechado" no card. */
  closed?: boolean;
  onAdd: () => void;
  onDec?: () => void;
  onInc?: () => void;
  /** Toque no corpo do card → abre detalhe do produto. */
  onPress?: () => void;
}

export function ProductCard({
  product,
  header,
  cartLabel,
  closed,
  onAdd,
  onDec,
  onInc,
  onPress,
}: ProductCardProps) {
  const hasPromo = product.promoPriceCents != null;
  const price = product.promoPriceCents ?? product.priceCents;
  const badge = product.saleType === "weight" ? "kg" : (product.packageSize ?? null);

  return (
    <View style={styles.card}>
      {header ? (
        <View style={styles.merchant}>
          <View style={styles.merchantLine}>
            <MerchantLogo name={header.merchant} logoUrl={header.logoUrl} size={16} />
            <Text variant="caption" numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
              {header.merchant}
              {header.distanceKm != null ? ` (${header.distanceKm}km)` : ""}
            </Text>
          </View>
          <View style={styles.deliveryLine}>
            <Ionicons name="bicycle" size={13} color={colors.textMuted} />
            <Text variant="caption" muted>
              {brl(header.deliveryFeeCents)}
            </Text>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} style={{ marginLeft: 6 }} />
            <Text variant="caption" muted>
              {header.eta}
            </Text>
            {closed ? (
              <View style={styles.closedChip}>
                <Text style={styles.closedChipText}>Fechado</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <Pressable onPress={onPress} disabled={!onPress}>
        <View>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.img} resizeMode="contain" />
          ) : (
            <View style={[styles.img, styles.imgEmpty]} />
          )}
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.priceRow}>
          {hasPromo ? <Text style={styles.strike}>{brl(product.priceCents)}</Text> : null}
          <Text style={styles.price}>{brl(price)}</Text>
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
      </Pressable>

      {cartLabel && onDec && onInc ? (
        <QtyStepper label={cartLabel} onDec={onDec} onInc={onInc} />
      ) : (
        <Button title="COMPRAR" size="sm" onPress={onAdd} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 158, gap: spacing.xs },
  merchant: { gap: 2 },
  merchantLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  deliveryLine: { flexDirection: "row", alignItems: "center", gap: 2 },
  closedChip: {
    marginLeft: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  closedChipText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  img: { width: "100%", height: 92, borderRadius: radius.sm, backgroundColor: colors.white },
  imgEmpty: { borderWidth: 1, borderColor: colors.border },
  badge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  strike: { color: colors.strike, fontSize: 12, textDecorationLine: "line-through" },
  price: { fontSize: 16, fontWeight: "700", color: colors.text },
  name: { fontSize: 13, color: colors.text, minHeight: 34 },
});
