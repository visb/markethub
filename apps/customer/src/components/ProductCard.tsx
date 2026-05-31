import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type ProductView } from "@/api/marketplace";
import { QtyStepper } from "./QtyStepper";

interface MerchantHeader {
  merchant: string;
  eta: string;
  distanceKm: number | null;
}

interface ProductCardProps {
  product: ProductView;
  /** Cabeçalho com mercado (home do marketplace multi-loja). */
  header?: MerchantHeader;
  /** Quantidade atual no carrinho (unidades) ou gramas; null = não está. */
  cartLabel?: string | null;
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
          <View style={styles.dot} />
          <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
            {header.merchant}
            {header.distanceKm != null ? ` (${header.distanceKm}km)` : ""}
          </Text>
          <Text variant="caption" muted>
            🛵 ⏱ {header.eta}
          </Text>
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
  merchant: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 14, height: 14, borderRadius: radius.full, backgroundColor: colors.border },
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
