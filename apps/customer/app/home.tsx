import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text, colors, radius, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { brl, marketplace, type Address, type FeedSection } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { ProductCard } from "@/components/ProductCard";
import { BottomTabs } from "@/components/BottomTabs";
import { CategoryMenu } from "@/components/CategoryMenu";
import Logo from "@/assets/logo.svg";

/** Iniciais do mercado p/ o atalho flutuante (sem logo no modelo ainda). */
function initials(name: string): string {
  const words = name.replace(/^(super)?mercado\s+/i, "").trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export default function MarketplaceHome() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const cart = useCart();
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSections(await mkt.feed());
      const addrs = await mkt.addresses();
      setAddress(addrs.find((a) => a.isDefault) ?? addrs[0] ?? null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Logo width={130} height={26} />
        <Pressable style={styles.location} onPress={() => router.push("/delivery")}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text variant="caption" numberOfLines={1} style={{ maxWidth: 130 }}>
            {address ? `${address.street}, ${address.number}` : "Definir endereço"}
          </Text>
          <Text style={styles.alterar}>Alterar</Text>
        </Pressable>
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

      <CategoryMenu
        categories={sections.map((s) => s.category)}
        onSelect={(c) => router.push(`/category/${c.id}?name=${encodeURIComponent(c.name)}`)}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          {sections.map((sec) => (
            <View key={sec.category.id}>
              <Text style={styles.section}>{sec.category.name}</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={sec.items}
                keyExtractor={(p) => p.offerId}
                contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    header={{
                      merchant: item.merchant,
                      eta: item.deliveryEta,
                      distanceKm: item.distanceKm,
                      deliveryFeeCents: item.deliveryFeeCents,
                    }}
                    cartLabel={cart.labelFor(item.offerId, item.saleType)}
                    onAdd={() => cart.add(item.offerId, item.saleType)}
                    onInc={() => cart.inc(item.offerId, item.saleType)}
                    onDec={() => cart.dec(item.offerId, item.saleType)}
                    onPress={() => router.push(`/product/${item.id}`)}
                  />
                )}
              />
            </View>
          ))}
        </ScrollView>
      )}

      {/* Atalhos flutuantes para as lojas com itens no carrinho (ref: Home.png) */}
      {cart.stores.length > 0 && (
        <View style={styles.storeStack}>
          {cart.stores.map((s) => (
            <Pressable
              key={s.storeId}
              style={styles.storeFab}
              onPress={() =>
                router.push(`/store/${s.storeId}?name=${encodeURIComponent(s.merchant)}`)
              }
            >
              <Text style={styles.storeFabText}>{initials(s.merchant)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {cart.total > 0 && (
        <Pressable style={styles.fab} onPress={() => router.push("/cart")}>
          <Ionicons name="cart" size={24} color={colors.white} />
          <Text style={styles.fabTotal}>{brl(cart.total)}</Text>
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
  storeStack: { position: "absolute", right: spacing.lg + 10, bottom: 168, gap: spacing.sm },
  storeFab: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  storeFabText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
});
