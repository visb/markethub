import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type ProductView } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { ProductCard } from "@/components/ProductCard";
import { CategoryMenu, type MenuCategory } from "@/components/CategoryMenu";
import { Header } from "@/components/Header";

export default function StoreHome() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const cart = useCart();
  const [sections, setSections] = useState<{
    featured: ProductView[];
    mostBought: ProductView[];
    recommended: ProductView[];
  } | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductView[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setSections(await mkt.sections(id));
      setCategories(await mkt.categories());
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSearch() {
    if (!id) return;
    const q = search.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setResults((await mkt.search(id, q)).items);
  }

  const cardProps = (item: ProductView) => ({
    product: item,
    cartLabel: cart.labelFor(item.offerId, item.saleType),
    onAdd: () => cart.add(item.offerId, item.saleType),
    onInc: () => cart.inc(item.offerId, item.saleType),
    onDec: () => cart.dec(item.offerId, item.saleType),
    onPress: () => router.push(`/product/${item.id}`),
  });

  const renderSection = (title: string, data: ProductView[]) => {
    if (data.length === 0) return null;
    return (
      <View key={title}>
        <Text style={styles.section}>{title}</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={data}
          keyExtractor={(p) => p.offerId}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}
          renderItem={({ item }) => <ProductCard {...cardProps(item)} />}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Header title={name ?? "Loja"} />

      <View style={styles.storeHead}>
        <View style={styles.logo}>
          <Ionicons name="storefront" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{name ?? "Loja"}</Text>
          <Text variant="caption" muted>
            🛵 Valor da entrega entre R$7 e R$15
          </Text>
          <Text variant="caption" muted>
            ⏱ Entrega em 30 min ou programada
          </Text>
        </View>
        <Button title="♡ Seguir" size="sm" onPress={() => {}} />
      </View>

      {/* Busca no header da loja */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Busque nesta loja..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            if (!v.trim()) setResults(null);
          }}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
      </View>

      {/* Menu de categorias (filtra por esta loja) */}
      <CategoryMenu
        categories={categories}
        onSelect={(c) =>
          router.push(`/category/${c.id}?name=${encodeURIComponent(c.name)}&storeId=${id}`)
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : results ? (
        <FlatList
          data={results}
          keyExtractor={(p) => p.offerId}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl }}
          ListEmptyComponent={<Text muted style={{ padding: spacing.lg }}>Nada encontrado.</Text>}
          renderItem={({ item }) => <ProductCard {...cardProps(item)} />}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          {renderSection("Ofertas em destaque", sections?.featured ?? [])}
          {renderSection("Mais comprados", sections?.mostBought ?? [])}
          {renderSection("Recomendados para você", sections?.recommended ?? [])}
        </ScrollView>
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
