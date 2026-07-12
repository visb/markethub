/** Coordenada simples (lat/lng) — fonte do centro do mapa e dos marcadores. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Região do mapa: centro + deltas (mesma forma do `Region` do react-native-maps). */
export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Mapa de entrega reutilizável entre apps (customer: rastreio ao vivo; driver:
 * mapa da entrega). Interface única independente de plataforma: a tela consome só
 * isto, sem saber se por baixo roda react-native-maps (nativo) ou Leaflet (web).
 * Três marcadores: loja (origem), endereço de entrega (destino) e um marcador
 * móvel (`driver` — entregador ao vivo no customer, posição atual no driver).
 */
export interface DeliveryMapProps {
  /** Região inicial (centro + deltas) — normalmente enquadra os pontos relevantes. */
  initialRegion: MapRegion;
  /** Marcador da loja (origem, pino vermelho). null = não renderiza. */
  store: LatLng | null;
  /** Marcador do endereço de entrega (destino, dot verde). null = não renderiza. */
  destination: LatLng | null;
  /** Marcador móvel (pino azul). null enquanto não há posição. */
  driver: LatLng | null;
}
