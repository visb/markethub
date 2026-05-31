import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type ProductView, type Store } from "@/api/marketplace";
import { ProductCard } from "@/components/ProductCard";
import { BottomTabs } from "@/components/BottomTabs";

export default function ExploreScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
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

  async function add(p: ProductView) {
    if (p.saleType === "weight") await mkt.addItem({ offerId: p.offerId, weightGrams: 300 });
    else await mkt.addItem({ offerId: p.offerId, quantity: 1 });
    router.push("/cart");
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
          contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.md }}
          ListEmptyComponent={<Text muted style={{ padding: spacing.lg }}>Nada encontrado.</Text>}
          renderItem={({ item }) => (
            <ProductCard product={item} onAdd={() => add(item)} />
          )}
        />
      )}
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
