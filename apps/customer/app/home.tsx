import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type ProductView, type Store } from "@/api/marketplace";

export default function HomeScreen() {
  const { api, logout } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStore = useCallback(async () => {
    setLoading(true);
    try {
      const merchants = await mkt.merchants();
      if (merchants[0]) {
        const stores = await mkt.stores(merchants[0].id);
        if (stores[0]) {
          setStore(stores[0]);
          const p = await mkt.products(stores[0].id);
          setProducts(p.items);
        }
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  async function runSearch() {
    if (!store) return;
    const r = search.trim() ? await mkt.search(store.id, search) : await mkt.products(store.id);
    setProducts(r.items);
  }

  async function add(p: ProductView) {
    if (p.saleType === "weight") await mkt.addItem({ offerId: p.offerId, weightGrams: 500 });
    else await mkt.addItem({ offerId: p.offerId, quantity: 1 });
    router.push("/cart");
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" muted>
            {store ? `${store.name}` : "MarketHub"}
          </Text>
          <Text variant="h2">Mercado</Text>
        </View>
        <Button title="Carrinho" variant="secondary" onPress={() => router.push("/cart")} />
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Buscar produto ou marca"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={runSearch}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.offerId}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2}>{item.name}</Text>
                <Text variant="caption" muted>
                  {item.brand ?? ""} {item.packageSize ?? ""}
                  {item.saleType === "weight" ? " · por kg" : ""}
                </Text>
                <Text style={{ color: colors.primary, marginTop: 2 }}>
                  {brl(item.promoPriceCents ?? item.priceCents)}
                </Text>
              </View>
              <Button title="+" onPress={() => add(item)} style={{ paddingHorizontal: spacing.md }} />
            </View>
          )}
        />
      )}

      <View style={styles.footer}>
        <Button title="Meus pedidos" variant="ghost" onPress={() => router.push("/orders")} />
        <Button title="Sair" variant="ghost" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  searchRow: { paddingHorizontal: spacing.lg },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.white },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
