import type { LatLng, MapRegion } from "@/lib/mapRegion";

/**
 * Mapa do rastreio de entrega ao vivo (story 51). Interface única independente de
 * plataforma: a tela `track/[id]` consome só isto, sem saber se por baixo roda
 * react-native-maps (nativo) ou Leaflet (web). Três marcadores: loja (origem),
 * endereço de entrega (destino) e entregador ao vivo.
 */
export interface DeliveryMapProps {
  /** Região inicial (centro + zoom) — normalmente enquadra loja + destino. */
  initialRegion: MapRegion;
  /** Marcador da loja (origem). null = não renderiza. */
  store: LatLng | null;
  /** Marcador do endereço de entrega (destino). null = não renderiza. */
  destination: LatLng | null;
  /** Marcador do entregador ao vivo. null enquanto não há posição. */
  driver: LatLng | null;
}
