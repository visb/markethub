import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors } from "@markethub/ui";
import { useCart } from "@/use-cart";
import { useExploreMap } from "@/api/hooks/useExploreMap";
import { CartFab } from "@/components/CartFab";
import { BottomTabs } from "@/components/BottomTabs";
import { StoreMap } from "@/components/MapView";
import { MapLoadingBadge } from "@/components/MapLoadingBadge";
import { StoreSummarySheet } from "@/components/StoreSummarySheet";
import { AddressBar } from "@/components/AddressBar";

/**
 * Aba explore = mapa de mercados (stories 05/06). Tela só orquestra: ViewModel
 * (`useExploreMap`) resolve centro/marcadores e os recarrega conforme o viewport;
 * o engine de mapa (react-native-maps nativo / Leaflet web) fica atrás de
 * `StoreMap`, com a mesma interface. O overlay de loading (story 06) aparece
 * enquanto a leva do viewport carrega.
 */
export default function ExploreScreen() {
  const router = useRouter();
  const cart = useCart();
  const {
    ready,
    initialRegion,
    stores,
    destination,
    activeAddress,
    onViewportChange,
    fetching,
  } = useExploreMap();
  // Marker tocado abre o modal de resumo (story 29) — estado de UI local. A
  // navegação para a loja passou a ser o CTA "Acessar loja" dentro do modal.
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.mapWrap}>
        {ready ? (
          <StoreMap
            initialRegion={initialRegion}
            stores={stores}
            destination={destination}
            onViewportChange={onViewportChange}
            onStorePress={(s) => setSelectedStoreId(s.id)}
          />
        ) : (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        )}
        {ready && fetching && <MapLoadingBadge />}
        <AddressBar address={activeAddress} onPress={() => router.push("/delivery")} />
      </View>

      <StoreSummarySheet storeId={selectedStoreId} onClose={() => setSelectedStoreId(null)} />

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
