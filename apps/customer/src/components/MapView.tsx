import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { regionToBounds } from "@/lib/mapRegion";
import type { StoreMapProps } from "./MapView.types";

/**
 * Mapa nativo (iOS/Android) via react-native-maps, provider Google. Marcador
 * vermelho para cada mercado; marcador "você está aqui" (dot azul com halo) na
 * localização do endereço ativo — distinto dos pinos de loja. Mesma interface
 * (`StoreMapProps`) da versão web (Leaflet) — a tela é agnóstica. Story 06: ao
 * fim do gesto (`onRegionChangeComplete`), normaliza a região (centro ± deltas →
 * bordas) e emite `onViewportChange`.
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
        <Marker coordinate={destination} title="Você está aqui" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.userHalo}>
            <View style={styles.userDot} />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  userHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
