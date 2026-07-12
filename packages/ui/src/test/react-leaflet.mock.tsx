/**
 * Mock leve de `react-leaflet` para rodar o `DeliveryMap.web` sob vitest. Os
 * componentes viram host components; os markers (posição + ícone) são capturados
 * em `webMarkers` p/ o teste inspecionar cor/posição.
 */
import React from "react";

export const webMarkers: Array<{ position: [number, number]; icon?: { __html?: string } }> = [];

export function MapContainer({ children }: { children?: React.ReactNode }) {
  return React.createElement("MapContainer", null, children);
}

export function TileLayer() {
  return null;
}

export function Popup({ children }: { children?: React.ReactNode }) {
  return React.createElement("Popup", null, children);
}

export function Marker(props: {
  position: [number, number];
  icon?: { __html?: string };
  children?: React.ReactNode;
}) {
  webMarkers.push({ position: props.position, icon: props.icon });
  return React.createElement("Marker", null, props.children);
}
