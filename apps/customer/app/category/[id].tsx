import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type FeedItem } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { ProductCard } from "@/components/ProductCard";
import { Header } from "@/components/Header";

/** Página da categoria: global (multi-mercado) ou de uma loja (storeId). Busca restrita à categoria. */
export default function CategoryPage() {
  const { id, name, storeId } = useLocalSearchParams<{ id: string; name?: string; storeId?: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const cart = useCart();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(
    async (q?: string) => {
      if (!id) return;
      const res = await mkt.categoryFeed(id, { q, storeId: storeId || undefined });
      setItems(res.items);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, storeId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchItems();
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSearch(q: string) {
    setSearch(q);
    await fetchItems(q.trim() || undefined);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={name ?? "Categoria"} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Buscar em ${name ?? "categoria"}...`}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            if (!v.trim()) void fetchItems();
          }}
          onSubmitEditing={(e) => runSearch(e.nativeEvent.text)}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.offerId}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<Text muted style={{ padding: spacing.lg }}>Nenhum produto encontrado.</Text>}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              header={
                !storeId
                  ? {
                      merchant: item.merchant,
                      eta: item.deliveryEta,
                      distanceKm: item.distanceKm,
                      deliveryFeeCents: item.deliveryFeeCents,
                    }
                  : undefined
              }
              cartLabel={cart.labelFor(item.offerId, item.saleType)}
              onAdd={() => cart.add(item.offerId, item.saleType)}
              onInc={() => cart.inc(item.offerId, item.saleType)}
              onDec={() => cart.dec(item.offerId, item.saleType)}
              onPress={() => router.push(`/product/${item.id}`)}
            />
          )}
        />
      )}

      {cart.total > 0 && (
        <Pressable style={styles.fab} onPress={() => router.push("/cart")}>
          <Ionicons name="cart" size={24} color={colors.white} />
          <Text style={styles.fabTotal}>{brl(cart.total)}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: { flex: 1, color: colors.text },
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
