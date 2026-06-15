import { NotFoundException } from "@nestjs/common";
import { EnrichmentService } from "./enrichment.service";

/**
 * Foco: merge do enriquecimento respeitando lockedFields (S1.5/S3.9) — campos
 * travados manualmente não são sobrescritos pelo resultado do Cosmos.
 */
const VALID_GTIN = "0000000000017"; // GTIN-13 com dígito verificador válido

function makeDeps(product: Record<string, unknown> | null, cached: unknown) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      update,
    },
    cosmosCache: {
      findUnique: jest.fn().mockResolvedValue(cached),
      upsert: jest.fn().mockResolvedValue({}),
    },
    productEnrichment: { upsert: jest.fn().mockResolvedValue({}) },
  } as never;
  const provider = { source: "cosmos", lookupByGtin: jest.fn() } as never;
  const mapper = { name: "heuristic", classify: jest.fn() } as never;
  const storage = { uploadBuffer: jest.fn() } as never;
  return { svc: new EnrichmentService(prisma, provider, mapper, storage), update, prisma };
}

describe("EnrichmentService.enrichProduct", () => {
  it("lança PRODUCT_NOT_FOUND quando o produto não existe", async () => {
    const { svc } = makeDeps(null, null);
    await expect(svc.enrichProduct("p1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("não sobrescreve campos travados, mas preenche os destravados", async () => {
    const product = {
      id: "p1",
      gtin: VALID_GTIN,
      name: "Nome Manual",
      brand: null,
      imageUrl: null,
      packageSize: null,
      categoryId: null,
      lockedFields: ["name"],
      category: null,
    };
    const cached = {
      found: true,
      payload: {
        gtin: VALID_GTIN,
        name: "Nome Cosmos",
        brand: "Marca Cosmos",
        imageUrl: null,
        unit: "500g",
        cosmosCategory: null,
      },
    };
    const { svc, update } = makeDeps(product, cached);
    const result = await svc.enrichProduct("p1");

    const { data } = update.mock.calls[0][0];
    expect(data).not.toHaveProperty("name"); // travado → não sobrescreve
    expect(data.brand).toBe("Marca Cosmos"); // destravado → preenche
    expect(data.packageSize).toBe("500g");
    expect(result.found).toBe(true);
    expect(result.status).toBeDefined();
  });

  it("sem GTIN válido não consulta o provider e fica pending", async () => {
    const product = {
      id: "p1",
      gtin: null,
      name: "X",
      brand: null,
      imageUrl: null,
      packageSize: null,
      categoryId: null,
      lockedFields: [],
      category: null,
    };
    const { svc, update } = makeDeps(product, null);
    const result = await svc.enrichProduct("p1");
    expect(result.found).toBe(false);
    expect(result.status).toBe("pending");
    // saleType recomputado pela heurística mesmo sem provider
    expect(update.mock.calls[0][0].data.saleType).toBe("unit");
  });
});
