import React, { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { DeliveryMapProps } from "./DeliveryMap.types";

/**
 * Mapa de entrega web (apenas desenvolvimento) via Leaflet + tiles OpenStreetMap —
 * sem chave do Google. Mesma interface (`DeliveryMapProps`) da versão nativa.
 * Ícones por `divIcon` (pino CSS) p/ evitar o problema das imagens default do
 * Leaflet sob bundler.
 */
const pinIcon = (color: string) =>
  L.divIcon({
    className: "mh-delivery-pin",
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });

const STORE_PIN = pinIcon("#E11D2A");
const DRIVER_PIN = pinIcon("#2563EB");

const DEST_ICON = L.divIcon({
  className: "mh-delivery-dest",
  html:
    '<div style="position:relative;width:28px;height:28px">' +
    '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(22,163,74,0.2)"></div>' +
    '<div style="position:absolute;left:7px;top:7px;width:14px;height:14px;border-radius:50%;background:#16A34A;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>' +
    "</div>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function DeliveryMap({ initialRegion, store, destination, driver }: DeliveryMapProps) {
  useEffect(() => {
    const id = "mh-delivery-map-style";
    if (typeof document === "undefined" || document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = ".leaflet-container{width:100%;height:100%;}";
    document.head.appendChild(style);
  }, []);

  return (
    <MapContainer
      center={[initialRegion.latitude, initialRegion.longitude]}
      zoom={14}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {store && (
        <Marker position={[store.latitude, store.longitude]} icon={STORE_PIN}>
          <Popup>Loja</Popup>
        </Marker>
      )}
      {destination && (
        <Marker position={[destination.latitude, destination.longitude]} icon={DEST_ICON}>
          <Popup>Entrega</Popup>
        </Marker>
      )}
      {driver && (
        <Marker position={[driver.latitude, driver.longitude]} icon={DRIVER_PIN}>
          <Popup>Entregador</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
