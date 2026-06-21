// Lojas / vitrine geográfica (mapa explore — stories 04/05/06)

/** Bounding box de viewport do mapa (bordas do retângulo visível). */
export interface ViewportBoundsDTO {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Marcador de loja no mapa do explore. Resposta enxuta de `GET /stores/nearby`
 * (sem produtos) — só o necessário p/ renderizar o pin e o card de prévia.
 */
export interface NearbyStoreDTO {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  avgPrepMinutes: number;
  merchantName: string;
  merchantLogoUrl: string | null;
}
