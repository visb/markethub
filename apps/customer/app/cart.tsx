import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type CartItemView, type CartView } from "@/api/marketplace";
import { Header } from "@/components/Header";
import { QtyStepper } from "@/components/QtyStepper";

export default function CartScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCart(await mkt.getCart());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(it: CartItemView, delta: number) {
    if (it.saleType === "weight") {
      const g = (it.weightGrams ?? 0) + delta * 100;
      if (g < 100) setCart(await mkt.removeItem(it.id));
      else setCart(await mkt.updateItem(it.id, { weightGrams: g }));
    } else {
      const q = it.quantity + delta;
      if (q <= 0) setCart(await mkt.removeItem(it.id));
      else setCart(await mkt.updateItem(it.id, { quantity: q }));
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Meu carrinho" />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  if (!cart || cart.itemCount === 0) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <Header title="Meu carrinho" />
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={56} color={colors.textMuted} />
          <Text variant="h2" style={{ marginTop: spacing.md }}>
            Carrinho vazio
          </Text>
          <Button
            title="Voltar às compras"
            variant="outline"
            style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
            onPress={() => router.replace("/home")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const t = cart.totals;
  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Meu carrinho" />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.lg }}>
        {cart.groups.map((g) => (
          <View key={g.merchantId} style={styles.groupCard}>
            <View style={styles.groupHead}>
              <View style={styles.dot}>
                <Ionicons name="storefront" size={14} color={colors.white} />
              </View>
              <Text style={{ flex: 1, fontWeight: "700" }}>{g.merchant}</Text>
              <Text variant="caption" muted>
                🛵 R$7 · ⏱ 30 min
              </Text>
            </View>

            {g.items.map((it) => (
              <View key={it.id} style={styles.item}>
                {it.imageUrl ? (
                  <Image source={{ uri: it.imageUrl }} style={styles.thumb} resizeMode="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2}>{it.name}</Text>
                  <Text variant="caption" style={{ color: colors.primary }}>
                    Adicionar observações
                  </Text>
                  <Text style={styles.itemPrice}>
                    {it.saleType === "weight"
                      ? `${brl(it.unitPriceCents)}/kg`
                      : brl(it.unitPriceCents)}
                  </Text>
                </View>
                <QtyStepper
                  label={it.saleType === "weight" ? `${it.weightGrams}g` : String(it.quantity)}
                  onDec={() => change(it, -1)}
                  onInc={() => change(it, 1)}
                />
              </View>
            ))}

            <Pressable style={styles.coupon} onPress={() => {}}>
              <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
              <Text variant="caption" muted>
                Adicionar cupom
              </Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.summary}>
          <Row label="Subtotal" value={brl(t.itemsCents)} />
          {t.prepCents > 0 && <Row label="Preparo do pedido" value={brl(t.prepCents)} />}
          <Row label="Taxa de entrega" value={brl(t.deliveryCents + t.doorSurchargeCents)} />
          <Row label="Taxa do MarketHub" value={brl(t.platformFeeCents)} />
          {t.discountCents > 0 && <Row label="Desconto" value={`- ${brl(t.discountCents)}`} />}
          <View style={styles.divider} />
          <Row label="Total" value={brl(t.totalCents)} bold />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Finalizar Compra" variant="outline" onPress={() => router.push("/checkout")} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const s = bold ? { fontWeight: "700" as const, fontSize: 18 } : undefined;
  return (
    <View style={styles.row}>
      <Text style={[{ color: bold ? colors.text : colors.textMuted }, s]}>{label}</Text>
      <Text style={s}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  groupCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.white },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  itemPrice: { fontWeight: "700", marginTop: 2 },
  coupon: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md },
  summary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
});
