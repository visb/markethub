import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type ProductView, type Store } from "@/api/marketplace";
import { ProductCard } from "@/components/ProductCard";
import { BottomTabs } from "@/components/BottomTabs";

interface CartEntry {
  itemId: string;
  quantity: number;
  weightGrams: number | null;
  saleType: "unit" | "weight";
}

export default function HomeScreen() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [sections, setSections] = useState<{
    featured: ProductView[];
    mostBought: ProductView[];
    recommended: ProductView[];
  } | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [cartMap, setCartMap] = useState<Record<string, CartEntry>>({});
  const [cartTotal, setCartTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshCart = useCallback(async () => {
    const cart = await mkt.getCart();
    const map: Record<string, CartEntry> = {};
    for (const g of cart.groups)
      for (const it of g.items)
        map[it.offerId] = {
          itemId: it.id,
          quantity: it.quantity,
          weightGrams: it.weightGrams,
          saleType: it.saleType,
        };
    setCartMap(map);
    setCartTotal(cart.totals.totalCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const merchants = await mkt.merchants();
      const stores = merchants[0] ? await mkt.stores(merchants[0].id) : [];
      if (stores[0]) {
        setStore(stores[0]);
        setSections(await mkt.sections(stores[0].id));
      }
      setCategories(await mkt.categories());
      await refreshCart();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function labelFor(p: ProductView): string | null {
    const e = cartMap[p.offerId];
    if (!e) return null;
    return e.saleType === "weight" ? `${e.weightGrams}g` : String(e.quantity);
  }

  async function add(p: ProductView) {
    if (p.saleType === "weight") await mkt.addItem({ offerId: p.offerId, weightGrams: 300 });
    else await mkt.addItem({ offerId: p.offerId, quantity: 1 });
    await refreshCart();
  }
  async function inc(p: ProductView) {
    const e = cartMap[p.offerId];
    if (!e) return add(p);
    if (e.saleType === "weight")
      await mkt.updateItem(e.itemId, { weightGrams: (e.weightGrams ?? 0) + 100 });
    else await mkt.updateItem(e.itemId, { quantity: e.quantity + 1 });
    await refreshCart();
  }
  async function dec(p: ProductView) {
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

  if (loading) {
    return (
      <SafeAreaView style={styles.flex}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={styles.storeHead}>
          <View style={styles.logo}>
            <Ionicons name="cart" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.storeName}>{store?.name ?? "MarketHub"}</Text>
            <Text variant="caption" muted>
              🛵 Valor da entrega entre R$7 e R$15
            </Text>
            <Text variant="caption" muted>
              ⏱ Entrega em 30 min ou programada
            </Text>
          </View>
          <Button title="♡ Seguir" size="sm" onPress={() => {}} />
        </View>

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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cats}>
          {categories.map((c) => (
            <Pressable key={c.id} onPress={() => router.push("/explore")}>
              <Text style={styles.catLink}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.section}>Stories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stories}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.story} />
          ))}
        </ScrollView>

        <Section title="Ofertas em destaque" data={sections?.featured ?? []} labelFor={labelFor} add={add} inc={inc} dec={dec} />
        <Section title="Mais comprados" data={sections?.mostBought ?? []} labelFor={labelFor} add={add} inc={inc} dec={dec} />
        <Section title="Recomendados para você" data={sections?.recommended ?? []} labelFor={labelFor} add={add} inc={inc} dec={dec} />
      </ScrollView>

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

function Section({
  title,
  data,
  labelFor,
  add,
  inc,
  dec,
}: {
  title: string;
  data: ProductView[];
  labelFor: (p: ProductView) => string | null;
  add: (p: ProductView) => void;
  inc: (p: ProductView) => void;
  dec: (p: ProductView) => void;
}) {
  if (data.length === 0) return null;
  return (
    <View>
      <Text style={styles.section}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(p) => p.offerId}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            cartLabel={labelFor(item)}
            onAdd={() => add(item)}
            onInc={() => inc(item)}
            onDec={() => dec(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  storeHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  logo: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  storeName: { color: colors.primary, fontSize: 18, fontWeight: "700" },
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
  cats: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  catLink: { color: colors.primary, fontWeight: "600", marginRight: spacing.lg },
  section: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  stories: { paddingHorizontal: spacing.md },
  story: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: "#D9D9D9",
    marginRight: spacing.md,
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
