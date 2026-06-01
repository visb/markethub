import { haversineMeters } from "../earnings.pricing";
import type { LatLng, RouteEstimate, RouteProvider } from "../route-provider.interface";

/** Velocidade média urbana assumida p/ estimar tempo (m/s) — ~25 km/h. */
const AVG_SPEED_MPS = 25_000 / 3600;

/** Provider mock (dev/sem token): soma haversine entre pontos consecutivos. */
export class HaversineRouteProvider implements RouteProvider {
  readonly name = "mock";

  estimate(points: LatLng[]): Promise<RouteEstimate> {
    let distanceMeters = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue;
      distanceMeters += haversineMeters(
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
      );
    }
    return Promise.resolve({
      distanceMeters,
      durationSeconds: Math.round(distanceMeters / AVG_SPEED_MPS),
    });
  }
}
