import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type ProductView } from "@/api/marketplace";
import { ProductCard } from "@/components/ProductCard";
import { Header } from "@/components/Header";

export default function StoreHome() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [sections, setSections] = useState<{
    featured: ProductView[];
    mostBought: ProductView[];
    recommended: ProductView[];
  } | null>(null);
  const [cartTotal, setCartTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setSections(await mkt.sections(id));
      const cart = await mkt.getCart();
      setCartTotal(cart.totals.totalCents);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(p: ProductView) {
    if (p.saleType === "weight") await mkt.addItem({ offerId: p.offerId, weightGrams: 300 });
    else await mkt.addItem({ offerId: p.offerId, quantity: 1 });
    const cart = await mkt.getCart();
    setCartTotal(cart.totals.totalCents);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={name ?? "Loja"} />
      <View style={styles.storeHead}>
        <View style={styles.logo}>
          <Ionicons name="storefront" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{name ?? "Loja"}</Text>
          <Text variant="caption" muted>
            🛵 Valor da entrega entre R$7 e R$15
          </Text>
          <Text variant="caption" muted>
            ⏱ Entrega em 30 min ou programada
          </Text>
        </View>
        <Button title="♡ Seguir" size="sm" onPress={() => {}} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <Section title="Ofertas em destaque" data={sections?.featured ?? []} add={add} open={(p) => router.push(`/product/${p.id}`)} />
          <Section title="Mais comprados" data={sections?.mostBought ?? []} add={add} open={(p) => router.push(`/product/${p.id}`)} />
          <Section title="Recomendados para você" data={sections?.recommended ?? []} add={add} open={(p) => router.push(`/product/${p.id}`)} />
        </ScrollView>
      )}

      {cartTotal > 0 && (
        <Pressable style={styles.fab} onPress={() => router.push("/cart")}>
          <Ionicons name="cart" size={24} color={colors.white} />
          <Text style={styles.fabTotal}>{brl(cartTotal)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function Section({
  title,
  data,
  add,
  open,
}: {
  title: string;
  data: ProductView[];
  add: (p: ProductView) => void;
  open: (p: ProductView) => void;
}) {
  if (data.length === 0) return null;
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(p) => p.offerId}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}
        renderItem={({ item }) => (
          <ProductCard product={item} onAdd={() => add(item)} onPress={() => open(item)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  storeHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  logo: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  storeName: { color: colors.primary, fontSize: 18, fontWeight: "700" },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  fabTotal: { color: colors.white, fontSize: 11, fontWeight: "700" },
});
