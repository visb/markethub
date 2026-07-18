import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { createGeocodingProvider } from "./geocoding.module";
import { GoogleGeocodingProvider } from "./providers/google.geocoding-provider";
import { MockGeocodingProvider } from "./providers/mock.geocoding-provider";
import { NominatimGeocodingProvider } from "./providers/nominatim.geocoding-provider";

/**
 * Story 75 — a factory do módulo reconhece `GEOCODING_PROVIDER=google` (exige
 * `GOOGLE_MAPS_API_KEY`). Cobre também nominatim, google sem chave (fallback
 * mock) e o mock default.
 */

type Keys = "GEOCODING_PROVIDER" | "GOOGLE_MAPS_API_KEY" | "NOMINATIM_BASE_URL";

function config(values: Partial<Pick<Env, Keys>>) {
  return {
    get: (key: keyof Env) => values[key as Keys],
  } as unknown as ConfigService<Env, true>;
}

describe("createGeocodingProvider", () => {
  it("GEOCODING_PROVIDER=google com chave → GoogleGeocodingProvider", () => {
    const provider = createGeocodingProvider(
      config({ GEOCODING_PROVIDER: "google", GOOGLE_MAPS_API_KEY: "k" }),
    );
    expect(provider).toBeInstanceOf(GoogleGeocodingProvider);
  });

  it("GEOCODING_PROVIDER=google sem chave → cai no Mock", () => {
    const provider = createGeocodingProvider(config({ GEOCODING_PROVIDER: "google" }));
    expect(provider).toBeInstanceOf(MockGeocodingProvider);
  });

  it("GEOCODING_PROVIDER=nominatim → NominatimGeocodingProvider", () => {
    const provider = createGeocodingProvider(
      config({ GEOCODING_PROVIDER: "nominatim", NOMINATIM_BASE_URL: "https://nominatim.test" }),
    );
    expect(provider).toBeInstanceOf(NominatimGeocodingProvider);
  });

  it("GEOCODING_PROVIDER=mock → MockGeocodingProvider", () => {
    const provider = createGeocodingProvider(config({ GEOCODING_PROVIDER: "mock" }));
    expect(provider).toBeInstanceOf(MockGeocodingProvider);
  });
});
