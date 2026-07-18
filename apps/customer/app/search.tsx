import React from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, colors, spacing } from "@markethub/ui";
import type { SearchMerchant } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { useProductSearch, useSearchGeo } from "@/api/hooks/useProductSearch";
import { ProductCard } from "@/components/ProductCard";
import { MerchantLogo } from "@/components/MerchantLogo";
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

  const { items, merchants, isLoading, hasMore, loadMore, isLoadingMore } = useProductSearch(
    term,
    geo,
  );

  const openMerchant = (mm: SearchMerchant) =>
    router.push(`/store/${mm.storeId}?name=${encodeURIComponent(mm.name)}`);

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
          ListHeaderComponent={
            merchants.length > 0 ? (
              <View testID="search-merchants" style={styles.merchants}>
                <Text variant="title" style={styles.merchantsTitle}>
                  Mercados
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.merchantsRow}
                >
                  {merchants.map((mm) => (
                    <Pressable
                      key={mm.merchantId}
                      testID={`search-merchant-${mm.merchantId}`}
                      style={styles.merchantChip}
                      onPress={() => openMerchant(mm)}
                    >
                      <MerchantLogo name={mm.name} logoUrl={mm.logoUrl} size={44} />
                      <Text variant="caption" numberOfLines={1} style={styles.merchantName}>
                        {mm.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null
          }
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
  merchants: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  merchantsTitle: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  merchantsRow: { gap: spacing.md, paddingHorizontal: spacing.md },
  merchantChip: { alignItems: "center", width: 72, gap: spacing.xs },
  merchantName: { textAlign: "center" },
});
