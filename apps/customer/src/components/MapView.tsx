import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { colors } from "@markethub/ui";
import { regionToBounds } from "@/lib/mapRegion";
import type { StoreMapProps } from "./MapView.types";

/**
 * Mapa nativo (iOS/Android) via react-native-maps, provider Google. Marcador
 * vermelho para cada mercado; pin distinto (cor primária) para o endereço ativo.
 * Mesma interface (`StoreMapProps`) da versão web (Leaflet) — a tela é agnóstica.
 * Story 06: ao fim do gesto (`onRegionChangeComplete`), normaliza a região
 * (centro ± deltas → bordas) e emite `onViewportChange`.
 */
export function StoreMap({
  initialRegion,
  stores,
  destination,
  onStorePress,
  onViewportChange,
}: StoreMapProps) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      initialRegion={initialRegion}
      onRegionChangeComplete={(region: Region) =>
        onViewportChange?.(regionToBounds(region))
      }
    >
      {stores.map((s) => (
        <Marker
          key={s.id}
          coordinate={{ latitude: s.latitude, longitude: s.longitude }}
          title={s.name}
          description={s.merchantName}
          pinColor="#E11D2A"
          onPress={() => onStorePress?.(s)}
        />
      ))}
      {destination && (
        <Marker
          coordinate={destination}
          title="Endereço de entrega"
          pinColor={colors.primary}
        />
      )}
    </MapView>
  );
}
