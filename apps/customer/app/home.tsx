import React, { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, colors, spacing } from "@markethub/ui";
import { useAuth } from "@/auth-context";
import { marketplace, type Address, type FeedSection, type GeoQuery } from "@/api/marketplace";
import { useCart } from "@/use-cart";
import { ProductCard } from "@/components/ProductCard";
import { BottomTabs } from "@/components/BottomTabs";
import { CartFab } from "@/components/CartFab";
import { CategoryMenu } from "@/components/CategoryMenu";
import { SearchBar } from "@/components/SearchBar";
import { DeliveryConfigSheet } from "@/components/DeliveryConfigSheet";
import { FeedSkeleton } from "@/components/FeedSkeleton";
import { MerchantLogo } from "@/components/MerchantLogo";
import { deviceAddress } from "@/location";
import { getFulfillmentMode, getRadiusKm, setFulfillmentMode, setRadiusKm, type FulfillmentMode } from "@/prefs";
import Logo from "@/assets/logo.svg";

/** Geo do feed: endereço padrão + raio escolhido (S6.4). */
function geoFor(address: Address | null, radiusKm: number): GeoQuery | undefined {
  if (address?.latitude == null || address.longitude == null) return undefined;
  return { lat: address.latitude, lng: address.longitude, radiusKm };
}

export default function MarketplaceHome() {
  const { api } = useAuth();
  const mkt = marketplace(api);
  const router = useRouter();
  const cart = useCart();
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<FulfillmentMode>("deliver");
  const [radiusKm, setRadius] = useState(13);
  // evita repedir localização a cada foco quando o usuário não tem endereço
  const autoTried = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [addrs, km, m] = await Promise.all([mkt.addresses(), getRadiusKm(), getFulfillmentMode()]);
      let addr = addrs.find((a) => a.isDefault) ?? addrs[0] ?? null;

      // Primeiro acesso sem endereço: pede localização e cria um automaticamente.
      if (!addr && !autoTried.current) {
        autoTried.current = true;
        const body = await deviceAddress();
        if (body) {
          try {
            addr = await mkt.addAddress(body);
          } catch {
            /* falha ao salvar → segue sem endereço, usuário define manualmente */
          }
        }
      }

      setAddress(addr);
      setRadius(km);
      setMode(m);
      setSections(await mkt.feed(geoFor(addr, km)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recarrega ao voltar (endereço pode ter mudado na tela de endereços)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function changeRadius(km: number) {
    setRadius(km);
    await setRadiusKm(km);
    setSections(await mkt.feed(geoFor(address, km)));
  }

  async function changeMode(m: FulfillmentMode) {
    setMode(m);
    await setFulfillmentMode(m);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Logo width={130} height={26} />
        <Pressable style={styles.location} onPress={() => setSheetOpen(true)}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text variant="caption" numberOfLines={1} style={{ maxWidth: 130 }}>
            {address ? `${address.street}, ${address.number}` : "Definir endereço"}
          </Text>
          <Text style={styles.alterar}>Alterar</Text>
        </Pressable>
      </View>

      <SearchBar
        onSubmit={(q) => router.push({ pathname: "/search", params: { q } })}
        onSelectCategory={(c) =>
          router.push(`/category/${c.id}?name=${encodeURIComponent(c.name)}`)
        }
      />

      <CategoryMenu
        categories={sections.map((s) => s.category)}
        onSelect={(c) => router.push(`/category/${c.id}?name=${encodeURIComponent(c.name)}`)}
      />

      {loading ? (
        <FeedSkeleton />
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
              onPress={() =>
                router.push(`/store/${s.storeId}?name=${encodeURIComponent(s.merchant)}`)
              }
            >
              <MerchantLogo name={s.merchant} logoUrl={s.logoUrl} size={52} style={styles.storeFab} />
            </Pressable>
          ))}
        </View>
      )}

      <CartFab totalCents={cart.total} onPress={() => router.push("/cart")} />

      <DeliveryConfigSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        mode={mode}
        onMode={(m) => void changeMode(m)}
        address={address}
        onPressAddress={() => {
          setSheetOpen(false);
          router.push("/delivery");
        }}
        radiusKm={radiusKm}
        onRadiusKm={(km) => void changeRadius(km)}
      />

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
  section: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  storeStack: { position: "absolute", right: spacing.lg + 6, bottom: 190, gap: spacing.sm },
  storeFab: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
