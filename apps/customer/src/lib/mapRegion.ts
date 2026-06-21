import type { Address, ViewportBoundsDTO } from "@/api/marketplace";

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
 * Centro padrão quando não há GPS nem endereço ativo: Curitiba/PR (cidade da loja
 * seed). Mantém a tela utilizável no primeiro acesso sem permissão de localização.
 */
export const DEFAULT_CENTER: LatLng = { latitude: -25.4284, longitude: -49.2733 };

/** Zoom inicial (~cidade). Deltas em graus; ~0.08 cobre poucos km. */
export const DEFAULT_DELTA = { latitudeDelta: 0.08, longitudeDelta: 0.08 };

/** Verdadeiro só quando ambas as coordenadas são números finitos. */
export function hasCoords(p: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}): p is LatLng {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
}

/**
 * Endereço de entrega ativo (faceta 3): o `isDefault`; na ausência dele, o `[0]`.
 * Retorna `null` quando a lista está vazia. A presença de lat/lng é checada por
 * quem renderiza o pin (ver `hasCoords`).
 */
export function selectActiveAddress(addresses: Address[]): Address | null {
  if (addresses.length === 0) return null;
  return addresses.find((a) => a.isDefault) ?? addresses[0];
}

/**
 * Centro inicial do mapa, em ordem de preferência (decisões travadas da story):
 * 1. localização do dispositivo (GPS) → `gps`;
 * 2. fallback: endereço de entrega ativo (com lat/lng);
 * 3. fallback final: `DEFAULT_CENTER`.
 * Função pura — testável sem o engine de mapa.
 */
export function resolveInitialRegion(args: {
  gps: LatLng | null;
  activeAddress: Address | null;
}): MapRegion {
  const { gps, activeAddress } = args;
  if (gps && hasCoords(gps)) return { ...gps, ...DEFAULT_DELTA };
  if (activeAddress && hasCoords(activeAddress)) {
    return {
      latitude: activeAddress.latitude as number,
      longitude: activeAddress.longitude as number,
      ...DEFAULT_DELTA,
    };
  }
  return { ...DEFAULT_CENTER, ...DEFAULT_DELTA };
}

/**
 * Bounding box (`ViewportBoundsDTO`) a partir de uma região centro+deltas —
 * formato esperado por `GET /stores/nearby`. Half-deltas para cada borda.
 */
export function regionToBounds(region: MapRegion): ViewportBoundsDTO {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return {
    north: region.latitude + halfLat,
    south: region.latitude - halfLat,
    east: region.longitude + halfLng,
    west: region.longitude - halfLng,
  };
}
