import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type Address, type FeedItem, type FeedSection } from "@/api/marketplace";
import { ProductCard } from "@/components/ProductCard";
import { BottomTabs } from "@/components/BottomTabs";

interface CartEntry {
  itemId: string;
  quantity: number;
  weightGrams: number | null;
  saleType: "unit" | "weight";
}

export default function MarketplaceHome() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [cartMap, setCartMap] = useState<Record<string, CartEntry>>({});
  const [cartTotal, setCartTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshCart = useCallback(async () => {
    const cart = await mkt.getCart();
    const map: Record<string, CartEntry> = {};
    for (const g of cart.groups)
      for (const it of g.items)
        map[it.offerId] = { itemId: it.id, quantity: it.quantity, weightGrams: it.weightGrams, saleType: it.saleType };
    setCartMap(map);
    setCartTotal(cart.totals.totalCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSections(await mkt.feed());
      const addrs = await mkt.addresses();
      setAddress(addrs.find((a) => a.isDefault) ?? addrs[0] ?? null);
      await refreshCart();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // Atualiza carrinho ao voltar de outra tela.
  useFocusEffect(useCallback(() => { void refreshCart(); }, [refreshCart]));

  function labelFor(p: FeedItem): string | null {
    const e = cartMap[p.offerId];
    if (!e) return null;
    return e.saleType === "weight" ? `${e.weightGrams}g` : String(e.quantity);
  }
  async function add(p: FeedItem) {
    if (p.saleType === "weight") await mkt.addItem({ offerId: p.offerId, weightGrams: 300 });
    else await mkt.addItem({ offerId: p.offerId, quantity: 1 });
    await refreshCart();
  }
  async function inc(p: FeedItem) {
    const e = cartMap[p.offerId];
    if (!e) return add(p);
    if (e.saleType === "weight") await mkt.updateItem(e.itemId, { weightGrams: (e.weightGrams ?? 0) + 100 });
    else await mkt.updateItem(e.itemId, { quantity: e.quantity + 1 });
    await refreshCart();
  }
  async function dec(p: FeedItem) {
    const e = cartMap[p.offerId];
    if (!e) return;
    if (e.saleType === "weight") {
      const g = (e.weightGrams ?? 0) - 100;
      if (g < 100) await mkt.removeItem(e.itemId);
      else await mkt.updateItem(e.itemId, { weightGrams: g });
    } else {
      if (e.quantity <= 1) await mkt.removeItem(e.itemId);
      else await mkt.updateItem(e.itemId, { quantity: e.quantity - 1 });
    }
    await refreshCart();
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      {/* Top: logo + endereço */}
      <View style={styles.topbar}>
        <Text style={styles.logo}>
          market<Text style={{ color: colors.text }}>hub</Text>
        </Text>
        <Pressable style={styles.location} onPress={() => router.push("/delivery")}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text variant="caption" numberOfLines={1} style={{ maxWidth: 140 }}>
            {address ? `${address.street}, ${address.number}` : "Definir endereço"}
          </Text>
          <Text style={styles.alterar}>Alterar</Text>
        </Pressable>
      </View>

      {/* Busca */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Busque por produtos, marcas ou departamento..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => router.push("/explore")}
        />
      </View>

      {/* Departamentos */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cats} contentContainerStyle={{ alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.md }}>
        <Ionicons name="menu" size={20} color={colors.primary} />
        {sections.map((s) => (
          <Text key={s.category.id} style={styles.catLink}>
            {s.category.name}
          </Text>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          {sections.map((sec) => (
            <View key={sec.category.id}>
              <Text style={styles.section}>
                {sec.category.icon} {sec.category.name}
              </Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={sec.items}
                keyExtractor={(p) => p.offerId}
                contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    header={{ merchant: item.merchant, eta: item.deliveryEta, distanceKm: item.distanceKm }}
                    cartLabel={labelFor(item)}
                    onAdd={() => add(item)}
                    onInc={() => inc(item)}
                    onDec={() => dec(item)}
                    onPress={() => router.push(`/product/${item.id}`)}
                  />
                )}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {cartTotal > 0 && (
        <Pressable style={styles.fab} onPress={() => router.push("/cart")}>
          <Ionicons name="cart" size={24} color={colors.white} />
          <Text style={styles.fabTotal}>{brl(cartTotal)}</Text>
        </Pressable>
      )}

      <BottomTabs active="home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  logo: { fontSize: 22, fontWeight: "800", color: colors.primary },
  location: { flexDirection: "row", alignItems: "center", gap: 4 },
  alterar: { color: colors.primary, fontWeight: "700", fontSize: 12, textDecorationLine: "underline" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: { flex: 1, color: colors.text },
  cats: { paddingVertical: spacing.md, maxHeight: 56 },
  catLink: { color: colors.primary, fontWeight: "600" },
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: 84,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  fabTotal: { color: colors.white, fontSize: 11, fontWeight: "700" },
});
