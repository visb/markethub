import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type FavoriteView } from "@/api/marketplace";
import { Header } from "@/components/Header";
import { MerchantLogo } from "@/components/MerchantLogo";

/** Lista de favoritos (S6.5): ofertas salvas, abre o detalhe e adiciona ao carrinho direto. */
export default function FavoritesScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [items, setItems] = useState<FavoriteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await mkt.favorites());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(fav: FavoriteView) {
    if (busy) return;
    setBusy(fav.offerId);
    try {
      if (fav.product.saleType === "weight") {
        await mkt.addItem({ offerId: fav.offerId, weightGrams: 300 });
      } else {
        await mkt.addItem({ offerId: fav.offerId, quantity: 1 });
      }
      router.push("/cart");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title="Favoritos" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items}
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
                      {item.store.name}
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
                    disabled={!item.available || busy === item.offerId}
                    onPress={() => void add(item)}
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
