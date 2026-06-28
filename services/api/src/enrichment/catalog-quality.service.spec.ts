import { CatalogQualityService } from "./catalog-quality.service";

/**
 * Qualidade de catálogo (S5.5): score/completude agregada, lista priorizada de
 * incompletos, reenfileiramento e snapshots. Sem DB — Prisma + fila mockados.
 */
function makeDeps() {
  const product = {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { completenessScore: null } }),
    groupBy: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const catalogQualitySnapshot = {
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "snap1", ...data })),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const prisma = { product, catalogQualitySnapshot } as never;
  const queue = {
    enqueueProduct: jest.fn().mockResolvedValue({ id: "job-p" }),
    enqueuePending: jest.fn().mockResolvedValue({ id: "job-pending" }),
  };
  return { prisma, product, catalogQualitySnapshot, queue, queueArg: queue as never };
}

describe("CatalogQualityService.summary", () => {
  it("agrega total, média arredondada, status e distribuição por faixa", async () => {
    const { prisma, product, queue, queueArg } = makeDeps();
    product.count.mockImplementation(({ where }) => {
      // count global (sem faixa) vs por bucket (com completenessScore)
      if (!where.completenessScore) return Promise.resolve(8);
      return Promise.resolve(where.completenessScore.gte === 100 ? 3 : 1);
    });
    product.aggregate.mockResolvedValue({ _avg: { completenessScore: 72.6 } });
    product.groupBy.mockResolvedValue([
      { enrichmentStatus: "enriched", _count: { _all: 5 } },
      { enrichmentStatus: "pending", _count: { _all: 3 } },
    ]);

    const res = await new CatalogQualityService(prisma, queueArg).summary();
    expect(res.total).toBe(8);
    expect(res.avgScore).toBe(73); // arredondado
    expect(res.byStatus).toEqual({ enriched: 5, pending: 3 });
    expect(res.distribution).toHaveLength(5);
    expect(res.distribution.find((d) => d.label === "100")?.count).toBe(3);
  });

  it("média nula vira 0", async () => {
    const { prisma, queue, queueArg } = makeDeps();
    const res = await new CatalogQualityService(prisma, queueArg).summary();
    expect(res.avgScore).toBe(0);
  });

  it("filtros storeId/categoryId entram no where (ofertas na loja + categoria)", async () => {
    const { prisma, product, queue, queueArg } = makeDeps();
    await new CatalogQualityService(prisma, queueArg).summary({ storeId: "s1", categoryId: "c1" });
    const where = product.aggregate.mock.calls[0][0].where;
    expect(where).toEqual({ categoryId: "c1", offers: { some: { storeId: "s1" } } });
  });
});

describe("CatalogQualityService.incomplete", () => {
  it("clampa o limite e filtra score < 100 ordenando pelo menor primeiro", async () => {
    const { prisma, product, queue, queueArg } = makeDeps();
    await new CatalogQualityService(prisma, queueArg).incomplete({ limit: 9999 });
    const args = product.findMany.mock.calls[0][0];
    expect(args.take).toBe(200); // teto
    expect(args.where.completenessScore).toEqual({ lt: 100 });
    expect(args.orderBy).toEqual([{ completenessScore: "asc" }, { updatedAt: "asc" }]);
  });

  it("mapeia hasImage e lista de campos faltantes", async () => {
    const { prisma, product, queue, queueArg } = makeDeps();
    product.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Arroz",
        brand: null,
        gtin: null,
        imageUrl: null,
        completenessScore: 25,
        enrichmentStatus: "pending",
        category: null,
      },
      {
        id: "p2",
        name: "Feijão",
        brand: "Camil",
        gtin: "789",
        imageUrl: "http://img",
        completenessScore: 85,
        enrichmentStatus: "enriched",
        category: { name: "Mercearia" },
      },
    ]);
    const res = await new CatalogQualityService(prisma, queueArg).incomplete();
    expect(res[0]).toMatchObject({
      id: "p1",
      hasImage: false,
      category: null,
      missing: ["imagem", "marca", "gtin", "categoria"],
    });
    expect(res[1]).toMatchObject({ hasImage: true, category: "Mercearia", missing: [] });
  });
});

describe("CatalogQualityService.requeue", () => {
  it("com productId enfileira só aquele produto", async () => {
    const { prisma, queue, queueArg } = makeDeps();
    const res = await new CatalogQualityService(prisma, queueArg).requeue("p1");
    expect(queue.enqueueProduct).toHaveBeenCalledWith("p1");
    expect(res).toEqual({ mode: "queued", scope: "product", jobId: "job-p" });
  });

  it("sem productId enfileira todos os pendentes", async () => {
    const { prisma, queue, queueArg } = makeDeps();
    const res = await new CatalogQualityService(prisma, queueArg).requeue();
    expect(queue.enqueuePending).toHaveBeenCalled();
    expect(res).toEqual({ mode: "queued", scope: "pending", jobId: "job-pending" });
  });
});

describe("CatalogQualityService.captureSnapshot", () => {
  it("persiste um snapshot a partir do summary corrente", async () => {
    const { prisma, product, catalogQualitySnapshot, queue, queueArg } = makeDeps();
    product.count.mockResolvedValue(10);
    product.aggregate.mockResolvedValue({ _avg: { completenessScore: 50 } });
    product.groupBy.mockResolvedValue([{ enrichmentStatus: "enriched", _count: { _all: 10 } }]);

    await new CatalogQualityService(prisma, queueArg).captureSnapshot();
    const { data } = catalogQualitySnapshot.create.mock.calls[0][0];
    expect(data).toMatchObject({ totalProducts: 10, avgScore: 50 });
    expect(data.byStatus).toEqual({ enriched: 10 });
    expect(Array.isArray(data.distribution)).toBe(true);
  });
});

describe("CatalogQualityService.snapshots", () => {
  it("ordena por captura desc e clampa o limite", async () => {
    const { prisma, catalogQualitySnapshot, queue, queueArg } = makeDeps();
    await new CatalogQualityService(prisma, queueArg).snapshots(9999);
    const args = catalogQualitySnapshot.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ capturedAt: "desc" });
    expect(args.take).toBe(180); // teto
  });

  it("usa default 30 quando não informado", async () => {
    const { prisma, catalogQualitySnapshot, queue, queueArg } = makeDeps();
    await new CatalogQualityService(prisma, queueArg).snapshots();
    expect(catalogQualitySnapshot.findMany.mock.calls[0][0].take).toBe(30);
  });
});
