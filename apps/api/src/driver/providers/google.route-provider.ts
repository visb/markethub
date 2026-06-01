import { Logger } from "@nestjs/common";
import type { LatLng, RouteEstimate, RouteProvider } from "../route-provider.interface";

interface GoogleLeg {
  distance?: { value?: number };
  duration?: { value?: number };
}
interface GoogleRoute {
  legs?: GoogleLeg[];
}
interface GoogleDirections {
  status?: string;
  routes?: GoogleRoute[];
}

/**
 * Google Directions API: origem = 1º ponto, destino = último, demais = waypoints
 * (na ordem). Soma as legs. Requer GOOGLE_MAPS_API_KEY.
 */
export class GoogleRouteProvider implements RouteProvider {
  readonly name = "google";
  private readonly logger = new Logger(GoogleRouteProvider.name);

  constructor(private readonly apiKey: string) {}

  async estimate(points: LatLng[]): Promise<RouteEstimate> {
    const valid = points.filter(
      (p): p is { lat: number; lng: number } => p.lat != null && p.lng != null,
    );
    if (valid.length < 2) return { distanceMeters: 0, durationSeconds: 0 };

    const origin = `${valid[0].lat},${valid[0].lng}`;
    const destination = `${valid[valid.length - 1].lat},${valid[valid.length - 1].lng}`;
    const waypoints = valid.slice(1, -1).map((p) => `${p.lat},${p.lng}`);

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", origin);
    url.searchParams.set("destination", destination);
    if (waypoints.length) url.searchParams.set("waypoints", waypoints.join("|"));
    url.searchParams.set("key", this.apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Google Directions ${res.status}`);
    const data = (await res.json()) as GoogleDirections;
    if (data.status !== "OK" || !data.routes?.length) {
      this.logger.warn(`Directions status ${data.status}`);
      throw new Error(`Google Directions status ${data.status}`);
    }
    const legs = data.routes[0].legs ?? [];
    const distanceMeters = legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0);
    const durationSeconds = legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0);
    return { distanceMeters, durationSeconds };
  }
}
