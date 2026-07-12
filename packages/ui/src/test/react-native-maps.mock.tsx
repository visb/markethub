/**
 * Mock leve de `react-native-maps` para rodar o `DeliveryMap` nativo sob vitest
 * (o engine real não importa fora do Metro). `MapView`/`Marker` viram host
 * components; os markers são capturados em `nativeMarkers` p/ o teste inspecionar
 * as coordenadas/props.
 */
import React from "react";

export const nativeMarkers: Array<Record<string, unknown>> = [];

export const PROVIDER_GOOGLE = "google";

export function Marker(props: Record<string, unknown>) {
  nativeMarkers.push(props);
  return null;
}

export default function MapView({ children }: { children?: React.ReactNode }) {
  return React.createElement("MapView", null, children);
}
