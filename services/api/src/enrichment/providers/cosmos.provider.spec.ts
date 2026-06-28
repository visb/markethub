import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { CosmosEnrichmentProvider } from "./cosmos.provider";

/**
 * Backfill de cobertura (story 26). HTTP do Cosmos é mockado via global.fetch —
 * sem rede real. Cobre resposta ok (mapeamento + fallback de categoria),
 * GTIN não encontrado (404 → null), rate limit (429) e erro genérico.
 */

function makeProvider() {
  const config = {
    get: jest.fn((key: keyof Env) => {
      if (key === "COSMOS_BASE_URL") return "https://api.cosmos.test";
      if (key === "COSMOS_TOKEN") return "token-123";
      return undefined;
    }),
  } as unknown as ConfigService<Env, true>;
  return new CosmosEnrichmentProvider(config);
}

function mockFetch(res: { status: number; ok?: boolean; json?: () => Promise<unknown> }) {
  const fetchMock = jest.fn().mockResolvedValue({
    status: res.status,
    ok: res.ok ?? (res.status >= 200 && res.status < 300),
    json: res.json ?? (() => Promise.resolve({})),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("CosmosEnrichmentProvider.lookupByGtin", () => {
  it("expõe a source cosmos", () => {
    expect(makeProvider().source).toBe("cosmos");
  });

  it("chama a URL correta com o header de token", async () => {
    const fetchMock = mockFetch({
      status: 200,
      json: () => Promise.resolve({ description: "Produto X" }),
    });
    await makeProvider().lookupByGtin("7891000100103");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cosmos.test/gtins/7891000100103.json",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Cosmos-Token": "token-123" }),
      }),
    );
  });

  it("mapeia a resposta ok para EnrichmentResult", async () => {
    mockFetch({
      status: 200,
      json: () =>
        Promise.resolve({
          description: "Leite Ninho",
          thumbnail: "https://img/ninho.jpg",
          brand: { name: "Ninho" },
          gpc: { code: "50080100", description: "Leite e derivados" },
          ncm: { code: "0402", description: "Leite NCM" },
        }),
    });
    const res = await makeProvider().lookupByGtin("7891000100103");
    expect(res).toMatchObject({
      gtin: "7891000100103",
      name: "Leite Ninho",
      brand: "Ninho",
      imageUrl: "https://img/ninho.jpg",
      ncm: "0402",
      gpc: "50080100",
      cosmosCategory: "Leite e derivados",
    });
  });

  it("usa a descrição do ncm quando não há gpc", async () => {
    mockFetch({
      status: 200,
      json: () =>
        Promise.resolve({
          description: "Sem GPC",
          ncm: { code: "0402", description: "Categoria NCM" },
        }),
    });
    const res = await makeProvider().lookupByGtin("123");
    expect(res?.cosmosCategory).toBe("Categoria NCM");
    expect(res?.brand).toBeNull();
    expect(res?.imageUrl).toBeNull();
  });

  it("retorna null quando o GTIN não é encontrado (404)", async () => {
    mockFetch({ status: 404, ok: false });
    await expect(makeProvider().lookupByGtin("000")).resolves.toBeNull();
  });

  it("lança em rate limit (429)", async () => {
    mockFetch({ status: 429, ok: false });
    await expect(makeProvider().lookupByGtin("000")).rejects.toThrow(/rate limit/);
  });

  it("lança em erro genérico (500)", async () => {
    mockFetch({ status: 500, ok: false });
    await expect(makeProvider().lookupByGtin("000")).rejects.toThrow(/Cosmos error 500/);
  });
});
