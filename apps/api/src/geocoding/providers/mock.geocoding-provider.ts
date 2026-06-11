import { Injectable } from "@nestjs/common";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocodingProvider,
} from "../geocoding-provider.interface";

/** Centro de Curitiba — âncora do mock em dev. */
const CURITIBA = { latitude: -25.4284, longitude: -49.2733 };

/**
 * Mock determinístico p/ dev/test: centro de Curitiba + deslocamento estável
 * derivado do endereço (mesmo endereço → mesmas coordenadas), até ~6 km.
 */
@Injectable()
export class MockGeocodingProvider implements GeocodingProvider {
  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const seed = `${query.street}|${query.number ?? ""}|${query.city}`;
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const dLat = (((h % 1000) / 1000) - 0.5) * 0.1; // ±0.05° ≈ ±5.5 km
    const dLng = ((((h >> 10) % 1000) / 1000) - 0.5) * 0.1;
    return {
      latitude: CURITIBA.latitude + dLat,
      longitude: CURITIBA.longitude + dLng,
    };
  }
}
