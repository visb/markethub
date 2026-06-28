import React, { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { ViewportBoundsDTO } from "@/api/marketplace";
import type { StoreMapProps } from "./MapView.types";

/**
 * Escuta o fim do gesto (move/zoom) do Leaflet e emite os bounds já normalizados.
 * `map.getBounds()` dá north/south/east/west prontos — mesma forma do nativo.
 * Componente filho do `MapContainer` (precisa do contexto do mapa). Story 06.
 */
function ViewportWatcher({ onChange }: { onChange?: (b: ViewportBoundsDTO) => void }) {
  const emit = (map: L.Map) => {
    if (!onChange) return;
    const b = map.getBounds();
    onChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  };
  useMapEvents({
    moveend: (e) => emit(e.target as L.Map),
    zoomend: (e) => emit(e.target as L.Map),
  });
  return null;
}

/**
 * Mapa web (apenas desenvolvimento) via Leaflet + tiles OpenStreetMap — não exige
 * chave do Google. Mesma interface (`StoreMapProps`) da versão nativa. Ícones por
 * `divIcon` (pino CSS colorido) p/ evitar o problema clássico das imagens default
 * do Leaflet sob bundler.
 */
const pinIcon = (color: string) =>
  L.divIcon({
    className: "mh-map-pin",
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });

const STORE_PIN = pinIcon("#E11D2A");

/**
 * Marcador "você está aqui": dot azul (#2563EB) com halo translúcido + borda
 * branca — visual distinto dos pinos de loja (vermelhos). Story 30.
 */
const USER_HERE_ICON = L.divIcon({
  className: "mh-map-user",
  html:
    '<div style="position:relative;width:28px;height:28px">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.2)"></div>' +
    '<div style="position:absolute;left:7px;top:7px;width:14px;height:14px;border-radius:50%;background:#2563EB;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>' +
    "</div>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function StoreMap({
  initialRegion,
  stores,
  destination,
  onStorePress,
  onViewportChange,
}: StoreMapProps) {
  // Garante 100% de altura do container do mapa no web.
  useEffect(() => {
    const id = "mh-map-style";
    if (typeof document === "undefined" || document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = ".leaflet-container{width:100%;height:100%;}";
    document.head.appendChild(style);
  }, []);

  return (
    <MapContainer
      center={[initialRegion.latitude, initialRegion.longitude]}
      zoom={13}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <ViewportWatcher onChange={onViewportChange} />
      {stores.map((s) => (
        <Marker
          key={s.id}
          position={[s.latitude, s.longitude]}
          icon={STORE_PIN}
          eventHandlers={{ click: () => onStorePress?.(s) }}
        >
          <Popup>
            {s.name}
            <br />
            {s.merchantName}
          </Popup>
        </Marker>
      ))}
      {destination && (
        <Marker
          position={[destination.latitude, destination.longitude]}
          icon={USER_HERE_ICON}
        >
          <Popup>Você está aqui</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
