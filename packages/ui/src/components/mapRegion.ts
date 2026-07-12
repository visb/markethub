import type { LatLng, MapRegion } from "./DeliveryMap.types";

/** Zoom mínimo (~bairro). Deltas em graus; ~0.02 cobre poucos quarteirões. */
export const DEFAULT_DELTA = { latitudeDelta: 0.02, longitudeDelta: 0.02 };

/** Verdadeiro só quando ambas as coordenadas são números finitos. */
export function hasCoords(p: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}): p is LatLng {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
}

/**
 * Enquadra uma região (centro + deltas) que contenha todos os pontos válidos,
 * com folga (`padding`) e um zoom mínimo p/ não colar nas bordas. Ignora pontos
 * nulos/sem coordenadas; retorna `null` quando nenhum ponto é válido (a tela
 * então não renderiza o mapa). Função pura — testável sem o engine de mapa.
 */
export function fitRegion(
  points: Array<LatLng | null | undefined>,
  padding = 1.6,
): MapRegion | null {
  const valid = points.filter((p): p is LatLng => !!p && hasCoords(p));
  if (valid.length === 0) return null;
  const lats = valid.map((p) => p.latitude);
  const lngs = valid.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * padding, DEFAULT_DELTA.latitudeDelta),
    longitudeDelta: Math.max((maxLng - minLng) * padding, DEFAULT_DELTA.longitudeDelta),
  };
}
