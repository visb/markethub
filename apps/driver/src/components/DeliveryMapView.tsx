import React from "react";
import { Dimensions, Linking, StyleSheet, View } from "react-native";
import { Button, DeliveryMap, Text, colors, fitRegion, radius, spacing, type LatLng } from "@markethub/ui";
import type { DeliveryDTO } from "@markethub/api-client";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";

/** ~40% da altura da tela para o mapa no topo da entrega. */
const MAP_HEIGHT = Math.round(Dimensions.get("window").height * 0.4);

/** Deep-link universal de navegação (Android → Google Maps; iOS → browser/app). Sem chave. */
export function navigationUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.latitude},${dest.longitude}`;
}

function point(lat?: number | null, lng?: number | null): LatLng | null {
  return typeof lat === "number" && typeof lng === "number" ? { latitude: lat, longitude: lng } : null;
}

/**
 * Mapa da entrega no topo da tela do driver (story 59): loja, cliente e posição
 * atual, com botão de navegação contextual por fase. Antes da coleta (`assigned`)
 * o alvo é a loja; após a coleta (`picked_up`) é o cliente. Retirada (sem endereço
 * de entrega) → sem marcador/alvo de cliente, o mapa mostra só a loja. Permissão de
 * localização negada não quebra: o mapa segue com os 2 marcadores fixos.
 */
export function DeliveryMapView({ delivery }: { delivery: DeliveryDTO }) {
  const { position, permissionDenied } = useCurrentLocation(
    delivery.status === "assigned" || delivery.status === "picked_up",
  );

  // Só há fase de mapa/navegação enquanto a entrega está em andamento.
  if (delivery.status !== "assigned" && delivery.status !== "picked_up") return null;

  const store = point(delivery.storeLat, delivery.storeLng);
  const customer = point(delivery.destLat, delivery.destLng);
  const afterPickup = delivery.status === "picked_up";

  // Alvo de navegação e enquadramento seguem a fase.
  const navTarget = afterPickup ? customer : store;
  const framePoints = afterPickup ? [customer, position] : [store, position];
  const region = fitRegion(framePoints) ?? fitRegion([store, customer, position]);
  if (!region) return null; // sem nenhuma coordenada → sem mapa

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={[styles.mapCard, { height: MAP_HEIGHT }]} testID="delivery-map">
        <DeliveryMap initialRegion={region} store={store} destination={customer} driver={position} />
      </View>

      {permissionDenied && (
        <Text muted variant="caption" style={{ marginTop: spacing.xs }}>
          Ative a localização para ver sua posição no mapa.
        </Text>
      )}

      {navTarget && (
        <Button
          title={afterPickup ? "Navegar até o cliente" : "Navegar até a loja"}
          variant="secondary"
          onPress={() => void Linking.openURL(navigationUrl(navTarget))}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
