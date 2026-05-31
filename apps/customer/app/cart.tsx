import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type CartView } from "@/api/marketplace";

export default function CartScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null);
  const [coupon, setCoupon] = useState("");
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

  async function changeQty(item: { id: string; saleType: string; quantity: number; weightGrams: number | null }, delta: number) {
    if (item.saleType === "weight") {
      const grams = Math.max(100, (item.weightGrams ?? 0) + delta * 100);
      setCart(await mkt.updateItem(item.id, { weightGrams: grams }));
    } else {
      const qty = item.quantity + delta;
      if (qty <= 0) setCart(await mkt.removeItem(item.id));
      else setCart(await mkt.updateItem(item.id, { quantity: qty }));
    }
  }

  async function applyCoupon() {
    if (!coupon.trim()) return;
    try {
      setCart(await mkt.applyCoupon(coupon.trim().toUpperCase()));
    } catch {
      /* cupom inválido */
    }
  }

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (!cart || cart.itemCount === 0) {
    return (
      <Screen>
        <Text variant="h2">Seu carrinho está vazio</Text>
        <Button title="Voltar às compras" style={{ marginTop: spacing.lg }} onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  const t = cart.totals;
  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Text variant="h2">Meu carrinho</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {cart.groups.map((g) => (
          <View key={g.merchantId} style={{ gap: spacing.sm }}>
            <Text variant="caption" muted>
              {g.merchant}
            </Text>
            {g.items.map((it) => (
              <View key={it.id} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{it.name}</Text>
                  <Text variant="caption" muted>
                    {it.saleType === "weight"
                      ? `${it.weightGrams}g · ${brl(it.unitPriceCents)}/kg`
                      : brl(it.unitPriceCents)}
                  </Text>
                </View>
                <View style={styles.qty}>
                  <Button title="−" variant="secondary" onPress={() => changeQty(it, -1)} style={styles.qtyBtn} />
                  <Text>{it.saleType === "weight" ? `${it.weightGrams}g` : it.quantity}</Text>
                  <Button title="+" variant="secondary" onPress={() => changeQty(it, 1)} style={styles.qtyBtn} />
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.couponRow}>
          <TextInput
            style={styles.input}
            placeholder="Cupom"
            autoCapitalize="characters"
            value={coupon}
            onChangeText={setCoupon}
            placeholderTextColor={colors.textMuted}
          />
          <Button title="Aplicar" variant="secondary" onPress={applyCoupon} />
        </View>

        <View style={styles.summary}>
          <Row label="Itens" value={brl(t.itemsCents)} />
          <Row label="Entrega" value={brl(t.deliveryCents)} />
          {t.prepCents > 0 && <Row label="Preparo" value={brl(t.prepCents)} />}
          <Row label="Taxa MarketHub" value={brl(t.platformFeeCents)} />
          {t.discountCents > 0 && <Row label="Desconto" value={`- ${brl(t.discountCents)}`} />}
          <Row label="Total" value={brl(t.totalCents)} bold />
        </View>
      </ScrollView>

      <View style={{ padding: spacing.lg }}>
        <Button title="Finalizar compra" onPress={() => router.push("/checkout")} />
      </View>
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={bold ? { fontWeight: "700" } : undefined}>{label}</Text>
      <Text style={bold ? { fontWeight: "700" } : undefined}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { padding: spacing.lg, paddingBottom: 0 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  qty: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qtyBtn: { height: 36, paddingHorizontal: spacing.md },
  couponRow: { flexDirection: "row", gap: spacing.sm },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
});
