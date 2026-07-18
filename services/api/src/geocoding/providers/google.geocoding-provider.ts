import { Injectable, Logger } from "@nestjs/common";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocodingProvider,
  ReverseGeocodeResult,
} from "../geocoding-provider.interface";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResponse {
  status: string;
  results?: {
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: GoogleAddressComponent[];
  }[];
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

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult | null> {
    const latlng = `${latitude},${longitude}`;
    const url =
      `${GOOGLE_GEOCODE_URL}?latlng=${encodeURIComponent(latlng)}` +
      `&language=pt-BR&key=${encodeURIComponent(this.apiKey)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Google Reverse Geocoding ${res.status} p/ "${latlng}"`);
        return null;
      }
      const body = (await res.json()) as GoogleGeocodeResponse;
      if (body.status !== "OK") {
        if (body.status !== "ZERO_RESULTS") {
          this.logger.warn(`Google Reverse Geocoding status ${body.status} p/ "${latlng}"`);
        }
        return null;
      }
      const components = body.results?.[0]?.address_components;
      if (!components) return null;
      return this.parseComponents(components);
    } catch (e) {
      this.logger.warn(`Reverse geocode falhou p/ "${latlng}": ${String(e)}`);
      return null;
    }
  }

  /**
   * Extrai o endereço BR dos `address_components` do Google. `route` = rua,
   * `street_number` = número, bairro via `sublocality`/`neighborhood`, cidade via
   * `administrative_area_level_2`/`locality`, UF de 2 letras via `short_name` do
   * `administrative_area_level_1` e CEP via `postal_code`.
   */
  private parseComponents(components: GoogleAddressComponent[]): ReverseGeocodeResult {
    const pick = (type: string, useShort = false): string | null => {
      const c = components.find((comp) => comp.types.includes(type));
      if (!c) return null;
      return useShort ? c.short_name : c.long_name;
    };
    return {
      street: pick("route"),
      number: pick("street_number"),
      district:
        pick("sublocality_level_1") ?? pick("sublocality") ?? pick("neighborhood"),
      city: pick("administrative_area_level_2") ?? pick("locality"),
      state: pick("administrative_area_level_1", true),
      zipCode: pick("postal_code"),
    };
  }
}
