import React, { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { StoreMapProps } from "./MapView.types";

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
const DEST_PIN = pinIcon("#00A859");

export function StoreMap({ initialRegion, stores, destination, onStorePress }: StoreMapProps) {
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
        <Marker position={[destination.latitude, destination.longitude]} icon={DEST_PIN}>
          <Popup>Endereço de entrega</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
