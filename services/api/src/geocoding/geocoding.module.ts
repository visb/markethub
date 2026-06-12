import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { GEOCODING_PROVIDER } from "./geocoding-provider.interface";
import { MockGeocodingProvider } from "./providers/mock.geocoding-provider";
import { NominatimGeocodingProvider } from "./providers/nominatim.geocoding-provider";

/** Geocodificação direta (S6.2): provider escolhido por env, mock em dev. */
@Module({
  providers: [
    {
      provide: GEOCODING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const provider = config.get("GEOCODING_PROVIDER", { infer: true });
        if (provider === "nominatim") {
          return new NominatimGeocodingProvider(
            config.get("NOMINATIM_BASE_URL", { infer: true }),
          );
        }
        return new MockGeocodingProvider();
      },
    },
  ],
  exports: [GEOCODING_PROVIDER],
})
export class GeocodingModule {}
