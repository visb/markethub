import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, colors, spacing } from "@markethub/ui";
import { useCart } from "@/use-cart";
import { useProductSearch, useSearchGeo } from "@/api/hooks/useProductSearch";
import { ProductCard } from "@/components/ProductCard";
import { CartFab } from "@/components/CartFab";
import { Header } from "@/components/Header";

/**
 * Resultado da busca global (story 80): produtos de todas as lojas próximas, cada
 * card com o badge da loja. A tela só orquestra `useProductSearch` (paginado) +
 * `useSearchGeo` (recorte da home); add ao carrinho segue o fluxo existente.
 */
export default function SearchScreen() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const cart = useCart();
  const geo = useSearchGeo();
  const term = (q ?? "").trim();

  const { items, isLoading, hasMore, loadMore, isLoadingMore } = useProductSearch(term, geo);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={term ? `"${term}"` : "Busca"} />

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.offerId}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore) loadMore();
          }}
          ListEmptyComponent={
            <Text muted style={{ padding: spacing.lg }}>
              {term
                ? `Nenhum produto encontrado para "${term}".`
                : "Digite ao menos 2 caracteres para buscar."}
            </Text>
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <View style={styles.badge} testID="store-badge">
                <Ionicons name="storefront-outline" size={12} color={colors.primary} />
                <Text variant="caption" numberOfLines={1} style={styles.badgeText}>
                  {item.storeName}
                  {item.distanceKm != null ? ` (${item.distanceKm}km)` : ""}
                </Text>
              </View>
              <ProductCard
                product={item}
                cartLabel={cart.labelFor(item.offerId, item.saleType)}
                onAdd={() => cart.add(item.offerId, item.saleType)}
                onInc={() => cart.inc(item.offerId, item.saleType)}
                onDec={() => cart.dec(item.offerId, item.saleType)}
                onPress={() => router.push(`/product/${item.id}`)}
              />
            </View>
          )}
        />
      )}

      <CartFab totalCents={cart.total} onPress={() => router.push("/cart")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  cell: { flex: 1, gap: spacing.xs },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.xs },
  badgeText: { flex: 1, fontWeight: "600" },
});
