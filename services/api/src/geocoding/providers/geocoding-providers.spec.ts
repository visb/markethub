import { GoogleGeocodingProvider } from "./google.geocoding-provider";
import { MockGeocodingProvider } from "./mock.geocoding-provider";
import { NominatimGeocodingProvider } from "./nominatim.geocoding-provider";

/**
 * Backfill de cobertura (story 28). O HTTP do Nominatim é mockado via
 * global.fetch — sem rede. Cobre hit, resposta vazia, status não-ok e exceção;
 * o mock determinístico cobre estabilidade (mesmo endereço → mesmas coords).
 */

const baseQuery = {
  street: "Rua das Flores",
  number: "100",
  city: "Curitiba",
  state: "PR",
};

function mockFetch(res: { ok?: boolean; status?: number; json?: () => Promise<unknown> }) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: res.ok ?? true,
    status: res.status ?? 200,
    json: res.json ?? (() => Promise.resolve([])),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("NominatimGeocodingProvider.geocode", () => {
  it("monta a URL com query e User-Agent e retorna coords do primeiro hit", async () => {
    const fetchMock = mockFetch({
      json: () => Promise.resolve([{ lat: "-25.43", lon: "-49.27" }]),
    });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").geocode(baseQuery);
    expect(res).toEqual({ latitude: -25.43, longitude: -49.27 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://nominatim.test/search");
    expect(url).toContain("countrycodes=br");
    expect(url).toContain(encodeURIComponent("Rua das Flores, 100"));
    expect(init.headers["User-Agent"]).toMatch(/markethub/);
  });

  it("retorna null quando a busca não traz resultados", async () => {
    mockFetch({ json: () => Promise.resolve([]) });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("retorna null em status não-ok", async () => {
    mockFetch({ ok: false, status: 429 });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("retorna null quando o fetch lança", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as never;
    const res = await new NominatimGeocodingProvider("https://nominatim.test").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("monta a query ignorando number ausente", async () => {
    const fetchMock = mockFetch({ json: () => Promise.resolve([]) });
    await new NominatimGeocodingProvider("https://nominatim.test").geocode({
      street: "Avenida Brasil",
      city: "Curitiba",
      state: "PR",
    });
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent("Avenida Brasil"));
  });
});

describe("GoogleGeocodingProvider.geocode", () => {
  const okBody = () =>
    Promise.resolve({
      status: "OK",
      results: [{ geometry: { location: { lat: -25.4321, lng: -49.2712 } } }],
    });

  it("monta o address (rua, número, cidade, UF, CEP) com region/language/key e parseia lat/lng", async () => {
    const fetchMock = mockFetch({ json: okBody });
    const res = await new GoogleGeocodingProvider("secret-key").geocode({
      ...baseQuery,
      zipCode: "80000-000",
    });
    expect(res).toEqual({ latitude: -25.4321, longitude: -49.2712 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url).toContain(
      `address=${encodeURIComponent("Rua das Flores, 100, Curitiba, PR, 80000-000")}`,
    );
    expect(url).toContain("region=br");
    expect(url).toContain("language=pt-BR");
    expect(url).toContain("key=secret-key");
  });

  it("monta o address ignorando number e zipCode ausentes", async () => {
    const fetchMock = mockFetch({ json: okBody });
    await new GoogleGeocodingProvider("k").geocode({
      street: "Avenida Brasil",
      city: "Curitiba",
      state: "PR",
    });
    expect(fetchMock.mock.calls[0][0]).toContain(
      `address=${encodeURIComponent("Avenida Brasil, Curitiba, PR")}`,
    );
  });

  it("retorna null em ZERO_RESULTS", async () => {
    mockFetch({ json: () => Promise.resolve({ status: "ZERO_RESULTS", results: [] }) });
    const res = await new GoogleGeocodingProvider("k").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("retorna null em status de erro (ex. REQUEST_DENIED)", async () => {
    mockFetch({ json: () => Promise.resolve({ status: "REQUEST_DENIED" }) });
    const res = await new GoogleGeocodingProvider("k").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("retorna null quando OK mas sem geometry", async () => {
    mockFetch({ json: () => Promise.resolve({ status: "OK", results: [{}] }) });
    const res = await new GoogleGeocodingProvider("k").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("retorna null em HTTP não-ok", async () => {
    mockFetch({ ok: false, status: 500 });
    const res = await new GoogleGeocodingProvider("k").geocode(baseQuery);
    expect(res).toBeNull();
  });

  it("retorna null quando o fetch lança", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as never;
    const res = await new GoogleGeocodingProvider("k").geocode(baseQuery);
    expect(res).toBeNull();
  });
});

describe("NominatimGeocodingProvider.reverseGeocode", () => {
  it("monta a URL /reverse com lat/lng e parseia o endereço BR (UF da ISO3166-2)", async () => {
    const fetchMock = mockFetch({
      json: () =>
        Promise.resolve({
          address: {
            road: "Rua das Flores",
            house_number: "100",
            suburb: "Centro",
            city: "Curitiba",
            "ISO3166-2-lvl4": "BR-PR",
            postcode: "80000-000",
          },
        }),
    });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").reverseGeocode(
      -25.43,
      -49.27,
    );
    expect(res).toEqual({
      street: "Rua das Flores",
      number: "100",
      district: "Centro",
      city: "Curitiba",
      state: "PR",
      zipCode: "80000-000",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://nominatim.test/reverse");
    expect(url).toContain("lat=-25.43");
    expect(url).toContain("lon=-49.27");
    expect(init.headers["User-Agent"]).toMatch(/markethub/);
  });

  it("cai em town/neighbourhood e deixa UF null sem ISO", async () => {
    mockFetch({
      json: () => Promise.resolve({ address: { town: "Pinhais", neighbourhood: "Centro" } }),
    });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").reverseGeocode(
      -25.4,
      -49.2,
    );
    expect(res).toEqual({
      street: null,
      number: null,
      district: "Centro",
      city: "Pinhais",
      state: null,
      zipCode: null,
    });
  });

  it("retorna null quando não há address", async () => {
    mockFetch({ json: () => Promise.resolve({}) });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });

  it("retorna null em status não-ok", async () => {
    mockFetch({ ok: false, status: 429 });
    const res = await new NominatimGeocodingProvider("https://nominatim.test").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });

  it("retorna null quando o fetch lança", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as never;
    const res = await new NominatimGeocodingProvider("https://nominatim.test").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });
});

describe("GoogleGeocodingProvider.reverseGeocode", () => {
  const okBody = () =>
    Promise.resolve({
      status: "OK",
      results: [
        {
          address_components: [
            { long_name: "100", short_name: "100", types: ["street_number"] },
            { long_name: "Rua das Flores", short_name: "Rua das Flores", types: ["route"] },
            { long_name: "Centro", short_name: "Centro", types: ["sublocality_level_1", "sublocality"] },
            {
              long_name: "Curitiba",
              short_name: "Curitiba",
              types: ["administrative_area_level_2", "political"],
            },
            {
              long_name: "Paraná",
              short_name: "PR",
              types: ["administrative_area_level_1", "political"],
            },
            { long_name: "80000-000", short_name: "80000-000", types: ["postal_code"] },
          ],
        },
      ],
    });

  it("monta latlng/language/key e parseia components → campos BR com UF 2 letras e CEP", async () => {
    const fetchMock = mockFetch({ json: okBody });
    const res = await new GoogleGeocodingProvider("secret-key").reverseGeocode(-25.4321, -49.2712);
    expect(res).toEqual({
      street: "Rua das Flores",
      number: "100",
      district: "Centro",
      city: "Curitiba",
      state: "PR",
      zipCode: "80000-000",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url).toContain(`latlng=${encodeURIComponent("-25.4321,-49.2712")}`);
    expect(url).toContain("language=pt-BR");
    expect(url).toContain("key=secret-key");
  });

  it("cai em locality/neighborhood e deixa null nos components ausentes", async () => {
    mockFetch({
      json: () =>
        Promise.resolve({
          status: "OK",
          results: [
            {
              address_components: [
                { long_name: "Vila", short_name: "Vila", types: ["neighborhood"] },
                { long_name: "Curitiba", short_name: "Curitiba", types: ["locality", "political"] },
              ],
            },
          ],
        }),
    });
    const res = await new GoogleGeocodingProvider("k").reverseGeocode(-25.4, -49.2);
    expect(res).toEqual({
      street: null,
      number: null,
      district: "Vila",
      city: "Curitiba",
      state: null,
      zipCode: null,
    });
  });

  it("retorna null em ZERO_RESULTS", async () => {
    mockFetch({ json: () => Promise.resolve({ status: "ZERO_RESULTS", results: [] }) });
    const res = await new GoogleGeocodingProvider("k").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });

  it("retorna null em status de erro (ex. REQUEST_DENIED)", async () => {
    mockFetch({ json: () => Promise.resolve({ status: "REQUEST_DENIED" }) });
    const res = await new GoogleGeocodingProvider("k").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });

  it("retorna null quando OK mas sem address_components", async () => {
    mockFetch({ json: () => Promise.resolve({ status: "OK", results: [{}] }) });
    const res = await new GoogleGeocodingProvider("k").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });

  it("retorna null em HTTP não-ok", async () => {
    mockFetch({ ok: false, status: 500 });
    const res = await new GoogleGeocodingProvider("k").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });

  it("retorna null quando o fetch lança", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as never;
    const res = await new GoogleGeocodingProvider("k").reverseGeocode(0, 0);
    expect(res).toBeNull();
  });
});

describe("MockGeocodingProvider.reverseGeocode", () => {
  it("retorna endereço fixo em Curitiba/PR (UF 2 letras, CEP)", async () => {
    const res = await new MockGeocodingProvider().reverseGeocode(-25.4, -49.2);
    expect(res).toMatchObject({ city: "Curitiba", state: "PR", zipCode: "80000-000" });
    expect(res!.state).toHaveLength(2);
  });

  it("é determinístico: mesmas coords → mesmo endereço", async () => {
    const provider = new MockGeocodingProvider();
    const a = await provider.reverseGeocode(-25.4, -49.2);
    const b = await provider.reverseGeocode(-25.4, -49.2);
    expect(a).toEqual(b);
  });
});

describe("MockGeocodingProvider.geocode", () => {
  it("retorna coords próximas a Curitiba", async () => {
    const res = await new MockGeocodingProvider().geocode(baseQuery);
    expect(res).not.toBeNull();
    expect(res!.latitude).toBeGreaterThan(-25.5);
    expect(res!.latitude).toBeLessThan(-25.35);
    expect(res!.longitude).toBeGreaterThan(-49.45);
    expect(res!.longitude).toBeLessThan(-49.2);
  });

  it("é determinístico: mesmo endereço → mesmas coordenadas", async () => {
    const provider = new MockGeocodingProvider();
    const a = await provider.geocode(baseQuery);
    const b = await provider.geocode(baseQuery);
    expect(a).toEqual(b);
  });

  it("endereços diferentes → coordenadas diferentes", async () => {
    const provider = new MockGeocodingProvider();
    const a = await provider.geocode(baseQuery);
    const b = await provider.geocode({ ...baseQuery, street: "Outra Rua", number: "55" });
    expect(a).not.toEqual(b);
  });

  it("aceita number ausente", async () => {
    const res = await new MockGeocodingProvider().geocode({
      street: "Rua X",
      city: "Curitiba",
      state: "PR",
    });
    expect(res).not.toBeNull();
  });
});
