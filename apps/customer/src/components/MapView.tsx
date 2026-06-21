import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { colors } from "@markethub/ui";
import type { StoreMapProps } from "./MapView.types";

/**
 * Mapa nativo (iOS/Android) via react-native-maps, provider Google. Marcador
 * vermelho para cada mercado; pin distinto (cor primária) para o endereço ativo.
 * Mesma interface (`StoreMapProps`) da versão web (Leaflet) — a tela é agnóstica.
 */
export function StoreMap({ initialRegion, stores, destination, onStorePress }: StoreMapProps) {
  return (
    <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={initialRegion}>
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
