import { Injectable, Logger } from "@nestjs/common";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocodingProvider,
} from "../geocoding-provider.interface";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

interface GoogleGeocodeResponse {
  status: string;
  results?: { geometry?: { location?: { lat: number; lng: number } } }[];
}

/**
 * Google Geocoding API: precisão de rua+número no Brasil (padrão pro cadastro de
 * endereço). Padrão PaymentProvider — atrás da interface, swappable, mockado no
 * teste. `fetch` HTTP simples (sem SDK); chave via env. Best-effort: `null` em
 * `ZERO_RESULTS`, status de erro ou exceção — não bloqueia o cadastro.
 */
@Injectable()
export class GoogleGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(GoogleGeocodingProvider.name);

  constructor(private readonly apiKey: string) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const address = [
      [query.street, query.number].filter(Boolean).join(", "),
      query.city,
      query.state,
      query.zipCode,
    ]
      .filter(Boolean)
      .join(", ");
    const url =
      `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(address)}` +
      `&region=br&language=pt-BR&key=${encodeURIComponent(this.apiKey)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Google Geocoding ${res.status} p/ "${address}"`);
        return null;
      }
      const body = (await res.json()) as GoogleGeocodeResponse;
      if (body.status !== "OK") {
        // ZERO_RESULTS, OVER_QUERY_LIMIT, REQUEST_DENIED... → best-effort null
        if (body.status !== "ZERO_RESULTS") {
          this.logger.warn(`Google Geocoding status ${body.status} p/ "${address}"`);
        }
        return null;
      }
      const loc = body.results?.[0]?.geometry?.location;
      if (!loc) return null;
      return { latitude: loc.lat, longitude: loc.lng };
    } catch (e) {
      this.logger.warn(`Geocode falhou p/ "${address}": ${String(e)}`);
      return null;
    }
  }
}
