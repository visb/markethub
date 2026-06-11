import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type ProductView, type Store } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { CartFab } from "@/components/CartFab";
import { ProductCard } from "@/components/ProductCard";
import { BottomTabs } from "@/components/BottomTabs";

export default function ExploreScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const cart = useCart();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const merchants = await mkt.merchants();
      const stores = merchants[0] ? await mkt.stores(merchants[0].id) : [];
      if (stores[0]) {
        setStore(stores[0]);
        setProducts((await mkt.products(stores[0].id)).items);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSearch() {
    if (!store) return;
    const r = search.trim() ? await mkt.search(store.id, search) : await mkt.products(store.id);
    setProducts(r.items);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Busque por produtos, marcas ou departamento..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.offerId}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<Text muted style={{ padding: spacing.lg }}>Nada encontrado.</Text>}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              cartLabel={cart.labelFor(item.offerId, item.saleType)}
              onAdd={() => cart.add(item.offerId, item.saleType)}
              onInc={() => cart.inc(item.offerId, item.saleType)}
              onDec={() => cart.dec(item.offerId, item.saleType)}
              onPress={() => router.push(`/product/${item.id}`)}
            />
          )}
        />
      )}

      <CartFab totalCents={cart.total} onPress={() => router.push("/cart")} />
      <BottomTabs active="explore" />
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
});
