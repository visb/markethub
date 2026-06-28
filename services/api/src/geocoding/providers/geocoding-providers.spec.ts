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
