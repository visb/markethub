/** Precificação pura do ganho do entregador por rota (centavos). Testável sem DB. */

export interface EarningsParams {
  baseCents: number;
  perKmCents: number;
  perStopCents: number;
}

/** Ganho = base + por km (sobre a distância total) + por parada. */
export function computeEarnings(
  distanceMeters: number,
  stopCount: number,
  p: EarningsParams,
): number {
  const km = Math.max(0, distanceMeters) / 1000;
  return Math.round(p.baseCents + p.perKmCents * km + p.perStopCents * Math.max(0, stopCount));
}

/** Distância haversine (metros) entre dois pontos. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
