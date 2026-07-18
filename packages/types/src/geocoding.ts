// Geocodificação reversa (story 76): lat/lng → endereço estruturado.

/**
 * Endereço resolvido pelo backend a partir de coordenadas do GPS
 * (`GET /geocoding/reverse?lat=&lng=`). Campos best-effort: o provider preenche o
 * que consegue extrair e deixa `null` no resto. `state` é UF de 2 letras. A
 * resposta inteira é `null` quando o backend não resolve (o app cai no CEP).
 * Espelha `ReverseGeocodeResult` do backend (services/api) — dois lados mantidos.
 */
export interface ReverseGeocodeResult {
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}
