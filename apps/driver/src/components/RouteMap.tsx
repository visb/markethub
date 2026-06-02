import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Text, colors, radius } from "@markethub/ui";
import MapView, { Marker, type Region } from "react-native-maps";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  kind?: "driver" | "pickup" | "dropoff";
}

const pinColor = (k?: MapPoint["kind"]) =>
  k === "driver" ? "#1E64FF" : k === "dropoff" ? colors.success : colors.primary;

/** Mapa com marcadores das paradas + posição do entregador. Fallback no web. */
export function RouteMap({ points, height = 200 }: { points: MapPoint[]; height?: number }) {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (Platform.OS === "web" || valid.length === 0) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text muted variant="caption">
          {valid.length === 0 ? "Mapa: sem coordenadas" : "Mapa indisponível no navegador"}
        </Text>
      </View>
    );
  }

  const region: Region = {
    latitude: valid[0].lat,
    longitude: valid[0].lng,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <MapView style={[styles.map, { height }]} initialRegion={region}>
      {valid.map((p, i) => (
        <Marker
          key={i}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          title={p.label}
          pinColor={pinColor(p.kind)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", borderRadius: radius.md },
  fallback: {
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});
