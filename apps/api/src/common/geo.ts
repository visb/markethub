/** Distância great-circle (km) entre dois pontos — suficiente p/ raio urbano. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Velocidade média urbana assumida p/ ETA por distância (S6.7). */
export const URBAN_SPEED_KMH = 25;

/**
 * ETA em minutos: preparo da loja + deslocamento à velocidade média urbana,
 * arredondado p/ cima em passos de 5 (apresentação).
 */
export function etaMinutes(prepMinutes: number, distanceKm: number): number {
  const travel = (distanceKm / URBAN_SPEED_KMH) * 60;
  return Math.max(5, Math.ceil((prepMinutes + travel) / 5) * 5);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
