import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { GeocodingController } from "./geocoding.controller";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "./geocoding-provider.interface";
import { GeocodingService } from "./geocoding.service";
import { GoogleGeocodingProvider } from "./providers/google.geocoding-provider";
import { MockGeocodingProvider } from "./providers/mock.geocoding-provider";
import { NominatimGeocodingProvider } from "./providers/nominatim.geocoding-provider";

/**
 * Seleciona o provider de geocodificação por env (padrão PaymentProvider):
 * `google` (com `GOOGLE_MAPS_API_KEY`) → Google Geocoding, precisão de rua+número;
 * `nominatim` → OSM (sem chave); caso contrário Mock determinístico (dev/test).
 * Exportado p/ teste.
 */
export function createGeocodingProvider(config: ConfigService<Env, true>): GeocodingProvider {
  const provider = config.get("GEOCODING_PROVIDER", { infer: true });
  const log = new Logger("GeocodingModule");
  if (provider === "google") {
    const key = config.get("GOOGLE_MAPS_API_KEY", { infer: true });
    if (key) {
      log.log("Using Google geocoding provider");
      return new GoogleGeocodingProvider(key);
    }
    log.warn("GEOCODING_PROVIDER=google sem GOOGLE_MAPS_API_KEY — caindo no Mock");
  }
  if (provider === "nominatim") {
    log.log("Using Nominatim geocoding provider");
    return new NominatimGeocodingProvider(config.get("NOMINATIM_BASE_URL", { infer: true }));
  }
  log.warn("Using Mock geocoding provider");
  return new MockGeocodingProvider();
}

/** Geocodificação direta (S6.2) + reversa (story 76): provider por env, mock em dev. */
@Module({
  controllers: [GeocodingController],
  providers: [
    GeocodingService,
    {
      provide: GEOCODING_PROVIDER,
      inject: [ConfigService],
      useFactory: createGeocodingProvider,
    },
  ],
  exports: [GEOCODING_PROVIDER],
})
export class GeocodingModule {}
