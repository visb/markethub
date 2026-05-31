import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type FeedItem, type ProductView } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { ProductCard } from "@/components/ProductCard";
import { Header } from "@/components/Header";

/** Página da categoria: global (multi-mercado) ou de uma loja específica (storeId). */
export default function CategoryPage() {
  const { id, name, storeId } = useLocalSearchParams<{ id: string; name?: string; storeId?: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const cart = useCart();
  const [items, setItems] = useState<(ProductView & Partial<FeedItem>)[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      if (storeId) {
        setItems((await mkt.storeCategoryProducts(storeId, id)).items);
      } else {
        setItems((await mkt.categoryFeed(id)).items);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={name ?? "Categoria"} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.offerId}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<Text muted style={{ padding: spacing.lg }}>Nenhum produto nesta categoria.</Text>}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              header={
                !storeId && item.merchant
                  ? {
                      merchant: item.merchant,
                      eta: item.deliveryEta ?? "30 min",
                      distanceKm: item.distanceKm ?? null,
                      deliveryFeeCents: item.deliveryFeeCents ?? 0,
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
