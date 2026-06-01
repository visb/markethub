/** Abstração de provedor de rotas (distância/tempo). Mock haversine ou Google Directions. */

export interface LatLng {
  lat: number | null;
  lng: number | null;
}

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteProvider {
  readonly name: string;
  /** Estima distância/tempo percorrendo os pontos na ordem dada. */
  estimate(points: LatLng[]): Promise<RouteEstimate>;
}

export const ROUTE_PROVIDER = Symbol("ROUTE_PROVIDER");
