import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import type { DeliveryMapProps } from "./DeliveryMap.types";

/**
 * Mapa de entrega nativo (iOS/Android) via react-native-maps, provider Google.
 * Loja (pino vermelho), destino (dot verde "endereço de entrega") e marcador móvel
 * (pino azul — entregador ao vivo no customer, posição atual no driver). Mesma
 * interface (`DeliveryMapProps`) da versão web (Leaflet) — a tela é agnóstica.
 * `react-native-maps` é peer dependency (Metro transpila o source do package).
 */
export function DeliveryMap({ initialRegion, store, destination, driver }: DeliveryMapProps) {
  return (
    <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} initialRegion={initialRegion}>
      {store && <Marker coordinate={store} title="Loja" pinColor="#E11D2A" />}
      {destination && (
        <Marker coordinate={destination} title="Entrega" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.destHalo}>
            <View style={styles.destDot} />
          </View>
        </Marker>
      )}
      {driver && <Marker coordinate={driver} title="Entregador" pinColor="#2563EB" />}
    </MapView>
  );
}

const styles = StyleSheet.create({
  destHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(22,163,74,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  destDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#16A34A",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
