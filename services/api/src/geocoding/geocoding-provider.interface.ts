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
 * Endereço estruturado resolvido por geocodificação reversa (lat/lng → endereço,
 * story 76). Campos best-effort: o provider preenche o que conseguir extrair e
 * deixa `null` no resto. `state` é UF de 2 letras. Espelhado em `packages/types`
 * (`ReverseGeocodeResult`) — o backend não importa `packages/types`.
 */
export interface ReverseGeocodeResult {
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/**
 * Geocodificação plugável (S6.2), no padrão do PaymentProvider: mock em dev,
 * Nominatim/OSM sem chave em produção inicial. Best-effort: null quando não resolve.
 */
export interface GeocodingProvider {
  geocode(query: GeocodeQuery): Promise<GeocodeResult | null>;
  /**
   * Reverso (story 76): lat/lng → endereço estruturado. Best-effort — `null`
   * quando não resolve (sem resultado, erro ou exceção). Não bloqueia o cadastro.
   */
  reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null>;
}

export const GEOCODING_PROVIDER = Symbol("GEOCODING_PROVIDER");
