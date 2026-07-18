import React from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
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
 * um no mesmo card da home (story 81) — header com o mercado, frete e tempo, e os
 * estados `closed`/`paused`. A tela só orquestra `useProductSearch` (paginado) +
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
              <ProductCard
                product={item}
                header={{
                  merchant: item.merchant,
                  logoUrl: item.merchantLogoUrl,
                  eta: item.deliveryEta,
                  distanceKm: item.distanceKm,
                  deliveryFeeCents: item.deliveryFeeCents,
                }}
                closed={!item.openNow}
                paused={item.paused}
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
  cell: { flex: 1 },
});
