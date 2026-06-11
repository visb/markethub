import { Injectable, Logger } from "@nestjs/common";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocodingProvider,
} from "../geocoding-provider.interface";

/**
 * Nominatim/OpenStreetMap: gratuito, sem chave. Política de uso exige User-Agent
 * identificável e ≤1 req/s — ok p/ cadastro de endereço (evento raro).
 */
@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(NominatimGeocodingProvider.name);

  constructor(private readonly baseUrl: string) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const q = [
      [query.street, query.number].filter(Boolean).join(", "),
      query.city,
      query.state,
      "Brasil",
    ]
      .filter(Boolean)
      .join(", ");
    const url = `${this.baseUrl}/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "markethub-dev/1.0 (geocoding de cadastro de endereço)" },
      });
      if (!res.ok) {
        this.logger.warn(`Nominatim ${res.status} p/ "${q}"`);
        return null;
      }
      const body = (await res.json()) as { lat: string; lon: string }[];
      const hit = body[0];
      if (!hit) return null;
      return { latitude: Number(hit.lat), longitude: Number(hit.lon) };
    } catch (e) {
      this.logger.warn(`Geocode falhou p/ "${q}": ${String(e)}`);
      return null;
    }
  }
}
