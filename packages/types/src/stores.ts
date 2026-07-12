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

/** Endereço da loja exibido no resumo (modal explore — story 29). */
export interface StoreSummaryAddressDTO {
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
}

/**
 * Resumo da loja para o modal do explore (`GET /stores/:id/summary` — story 29),
 * buscado ao tocar o marker. `openNow` é computado no servidor (timezone
 * America/Sao_Paulo); `rating` é `null` quando a loja não tem avaliações.
 * Faixa de frete = [`deliveryFeeCents` (piso), `doorFeeCents` (teto)].
 */
export interface StoreSummaryDTO {
  id: string;
  name: string;
  merchantName: string;
  merchantLogoUrl: string | null;
  address: StoreSummaryAddressDTO;
  phone: string | null;
  /** null = loja sem avaliações ainda. */
  rating: { average: number; count: number } | null;
  /** ETA em minutos (avgPrepMinutes). */
  etaMinutes: number;
  /** piso da faixa de frete (taxa efetiva da loja — story 58). */
  deliveryFeeCents: number;
  /** teto da faixa de frete (deliveryFee + door surcharge). */
  doorFeeCents: number;
  /** Pedido mínimo da loja em centavos (story 58); null = sem mínimo. */
  minOrderCents: number | null;
  /** Raio de entrega da loja em km (story 58); null = sem limite além da cidade. */
  deliveryRadiusKm: number | null;
  allowsPickup: boolean;
  openNow: boolean;
  /** Loja em pausa temporária (story 57): força `openNow=false` e distingue de "fechada". */
  paused: boolean;
}
