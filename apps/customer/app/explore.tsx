import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "@markethub/ui";
import { useCart } from "@/use-cart";
import { useExploreMap } from "@/api/hooks/useExploreMap";
import { CartFab } from "@/components/CartFab";
import { BottomTabs } from "@/components/BottomTabs";
import { StoreMap } from "@/components/MapView";

/**
 * Aba explore = mapa de mercados (story 05). Tela só orquestra: ViewModel
 * (`useExploreMap`) resolve centro/marcadores; o engine de mapa (react-native-maps
 * nativo / Leaflet web) fica atrás de `StoreMap`, com a mesma interface.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const cart = useCart();
  const { ready, initialRegion, stores, destination } = useExploreMap();

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.mapWrap}>
        {ready ? (
          <StoreMap
            initialRegion={initialRegion}
            stores={stores}
            destination={destination}
            onStorePress={(s) => router.push(`/store/${s.id}?name=${encodeURIComponent(s.merchantName)}`)}
          />
        ) : (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        )}
      </View>

      <CartFab totalCents={cart.total} onPress={() => router.push("/cart")} />
      <BottomTabs active="explore" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1, overflow: "hidden" },
  loading: { flex: 1 },
});
