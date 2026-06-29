import { MockEnrichmentProvider } from "./mock.provider";

/**
 * Backfill de cobertura (story 26). Provider de fallback usado sem COSMOS_TOKEN.
 * Retorna fixtures canônicas para GTINs conhecidos e null para desconhecidos.
 */

describe("MockEnrichmentProvider", () => {
  const provider = new MockEnrichmentProvider();

  it("expõe a source mock", () => {
    expect(provider.source).toBe("mock");
  });

  it("retorna dados canônicos para GTIN conhecido", async () => {
    const res = await provider.lookupByGtin("7891000100103");
    expect(res).toMatchObject({
      gtin: "7891000100103",
      name: "Leite em Pó Integral Ninho 380g",
      brand: "Ninho",
      ncm: "0402",
      cosmosCategory: "Leite e derivados",
    });
    expect(res?.raw).toMatchObject({ mock: true });
  });

  it("retorna null para GTIN desconhecido", async () => {
    await expect(provider.lookupByGtin("0000000000000")).resolves.toBeNull();
  });
});
