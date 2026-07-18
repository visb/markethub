import React, { useCallback } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { brl, type FavoriteView } from "@/api/marketplace";
import { useAddFavoriteToCart, useFavorites } from "@/api/hooks/useProductDetail";
import { Header } from "@/components/Header";
import { MerchantLogo } from "@/components/MerchantLogo";

/** Lista de favoritos (S6.5): ofertas salvas, abre o detalhe e adiciona ao carrinho direto. */
export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites, loading } = useFavorites();
  const addToCart = useAddFavoriteToCart();

  const add = useCallback(
    (fav: FavoriteView) => {
      if (addToCart.isPending) return;
      addToCart.mutate(fav, { onSuccess: () => router.push("/cart") });
    },
    [addToCart, router],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Favoritos" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(f) => f.offerId}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={
            <Text muted style={{ padding: spacing.md }}>
              Nenhum favorito ainda. Toque no coração no detalhe do produto.
            </Text>
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            const price = item.promoPriceCents ?? item.priceCents;
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/product/${item.product.id}`)}>
                {item.product.imageUrl ? (
                  <Image source={{ uri: item.product.imageUrl }} style={styles.thumb} resizeMode="contain" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: "600" }} numberOfLines={2}>
                    {item.product.name}
                  </Text>
                  <View style={styles.storeRow}>
                    <MerchantLogo name={item.store.merchantName} logoUrl={item.store.merchantLogoUrl} size={18} />
                    <Text variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
                      {item.store.merchantName}
                    </Text>
                  </View>
                  {item.available ? (
                    <Text style={{ fontWeight: "700", color: colors.primary }}>
                      {brl(price)}
                      {item.promoPriceCents != null && (
                        <Text variant="caption" muted style={styles.strike}>
                          {"  "}
                          {brl(item.priceCents)}
                        </Text>
                      )}
                    </Text>
                  ) : (
                    <Text variant="caption" style={{ color: colors.textMuted }}>
                      Indisponível
                    </Text>
                  )}
                </View>
                <View style={{ justifyContent: "center" }}>
                  <Button
                    title="Adicionar"
                    size="sm"
                    disabled={
                      !item.available ||
                      (addToCart.isPending && addToCart.variables?.offerId === item.offerId)
                    }
                    onPress={() => add(item)}
                  />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.white },
  thumbEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  storeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  strike: { textDecorationLine: "line-through" },
  sep: { height: 1, backgroundColor: colors.border },
});
