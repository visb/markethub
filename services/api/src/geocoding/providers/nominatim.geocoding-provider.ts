import { Injectable, Logger } from "@nestjs/common";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocodingProvider,
  ReverseGeocodeResult,
} from "../geocoding-provider.interface";

/** UF de 2 letras é a `ISO3166-2-lvl4` do Nominatim (ex. "BR-PR" → "PR"). */
interface NominatimAddress {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  municipality?: string;
  state?: string;
  "ISO3166-2-lvl4"?: string;
  postcode?: string;
}

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

  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult | null> {
    const url =
      `${this.baseUrl}/reverse?format=jsonv2&addressdetails=1` +
      `&accept-language=pt-BR&lat=${latitude}&lon=${longitude}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "markethub-dev/1.0 (geocoding de cadastro de endereço)" },
      });
      if (!res.ok) {
        this.logger.warn(`Nominatim reverse ${res.status} p/ "${latitude},${longitude}"`);
        return null;
      }
      const body = (await res.json()) as { address?: NominatimAddress };
      const a = body.address;
      if (!a) return null;
      const iso = a["ISO3166-2-lvl4"]; // "BR-PR"
      const uf = iso?.includes("-") ? (iso.split("-")[1] ?? null) : null;
      return {
        street: a.road ?? null,
        number: a.house_number ?? null,
        district: a.suburb ?? a.neighbourhood ?? null,
        city: a.city ?? a.town ?? a.municipality ?? null,
        state: uf,
        zipCode: a.postcode ?? null,
      };
    } catch (e) {
      this.logger.warn(`Reverse geocode falhou p/ "${latitude},${longitude}": ${String(e)}`);
      return null;
    }
  }
}
