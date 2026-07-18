import { Inject, Injectable } from "@nestjs/common";
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
  type ReverseGeocodeResult,
} from "./geocoding-provider.interface";

/**
 * Fachada fina sobre o provider de geocodificação (story 76). Mantém o controller
 * sem regra: hoje só delega o reverso; ponto de extensão p/ cache/rate-limit.
 */
@Injectable()
export class GeocodingService {
  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly provider: GeocodingProvider,
  ) {}

  reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    return this.provider.reverseGeocode(lat, lng);
  }
}
