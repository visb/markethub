/** Endereço estruturado p/ geocodificação direta (endereço → lat/lng). */
export interface GeocodeQuery {
  street: string;
  number?: string | null;
  city: string;
  state: string;
  zipCode?: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
}

/**
 * Geocodificação plugável (S6.2), no padrão do PaymentProvider: mock em dev,
 * Nominatim/OSM sem chave em produção inicial. Best-effort: null quando não resolve.
 */
export interface GeocodingProvider {
  geocode(query: GeocodeQuery): Promise<GeocodeResult | null>;
}

export const GEOCODING_PROVIDER = Symbol("GEOCODING_PROVIDER");
