import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type ProductView, type StoreMeta } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { CartFab } from "@/components/CartFab";
import { ProductCard } from "@/components/ProductCard";
import { CategoryMenu, type MenuCategory } from "@/components/CategoryMenu";
import { Header } from "@/components/Header";
import { FollowButton } from "@/components/FollowButton";
import { MerchantLogo } from "@/components/MerchantLogo";
import { useStoreFollow } from "@/api/hooks/useStoreFollow";
import { useStoreReviews } from "@/api/hooks/useStoreReviews";
import { StoreReviews, Stars } from "@/components/StoreReviews";
import { storeOpenLabel } from "@/lib/storeOpen";
import { getRadiusKm } from "@/prefs";

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
  const [store, setStore] = useState<StoreMeta | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductView[] | null>(null);
  const [loading, setLoading] = useState(true);
  // Seguir loja (story 34): estado inicial vem do sections; toggle via React Query.
  const follow = useStoreFollow(id ?? "", store?.following);
  // Avaliações públicas da rede (story 56) — só busca quando o merchantId chegar.
  const reviews = useStoreReviews(store?.merchantId);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // ETA/distância reais desta loja a partir do endereço padrão (S6.7)
      let geo;
      try {
        const [addrs, km] = await Promise.all([mkt.addresses(), getRadiusKm()]);
        const addr = addrs.find((a) => a.isDefault) ?? addrs[0] ?? null;
        if (addr?.latitude != null && addr.longitude != null) {
          geo = { lat: addr.latitude, lng: addr.longitude, radiusKm: km };
        }
      } catch {
        /* sem endereço */
      }
      const data = await mkt.sections(id, geo);
      setStore(data.store);
      setSections({
        featured: data.featured,
        mostBought: data.mostBought,
        recommended: data.recommended,
      });
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
      {/* Story 32: título do AppBar vazio — o nome do mercado fica só no storeHead, ao lado da logo. */}
      {/* Story 33: botão "Seguir" no topo direito (no lugar do "?"). Story 34: wirado ao follow real. */}
      <Header
        title=""
        rightAction={<FollowButton following={follow.following} onPress={() => { if (!follow.isToggling) follow.toggle(); }} />}
      />

      <View style={styles.storeHead}>
        <MerchantLogo name={store?.merchantName ?? name ?? "Loja"} logoUrl={store?.merchantLogoUrl} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.storeName}>{store?.merchantName ?? name ?? "Loja"}</Text>
          <Text variant="caption" muted>
            🛵 Entrega {store ? brl(store.deliveryFeeCents) : "—"}
            {store?.distanceKm != null ? ` · ${store.distanceKm} km` : ""}
          </Text>
          <Text variant="caption" muted>
            ⏱ {store ? `${store.etaMinutes} min` : "30 min"} ou programada
          </Text>
          {store && reviews.count > 0 && (
            <View style={styles.ratingBadge} testID="store-rating-badge">
              <Stars rating={reviews.average} size={13} />
              <Text variant="caption" style={styles.ratingText}>
                {reviews.average.toFixed(1).replace(".", ",")} · {reviews.count}{" "}
                {reviews.count === 1 ? "avaliação" : "avaliações"}
              </Text>
            </View>
          )}
          {store && (
            <View
              style={[styles.openBadge, { borderColor: store.openNow ? colors.success : colors.textMuted }]}
            >
              <Text
                variant="caption"
                style={{ color: store.openNow ? colors.success : colors.textMuted, fontWeight: "700" }}
              >
                {storeOpenLabel(store)}
              </Text>
            </View>
          )}
        </View>
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
          {store && (
            <StoreReviews
              merchantName={store.merchantName}
              items={reviews.items}
              count={reviews.count}
              isLoading={reviews.isLoading}
              hasMore={reviews.hasMore}
              isLoadingMore={reviews.isLoadingMore}
              onLoadMore={reviews.loadMore}
            />
          )}
        </ScrollView>
      )}

      <CartFab totalCents={cart.total} onPress={() => router.push("/cart")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  storeHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  storeName: { color: colors.primary, fontSize: 18, fontWeight: "700" },
  openBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 4 },
  ratingText: { color: colors.text, fontWeight: "700" },
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
});
