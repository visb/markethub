import { NotFoundException } from "@nestjs/common";
import { AdminCatalogService } from "./admin-catalog.service";

/**
 * Foco: lockedFields (S3.9) — só os campos enviados pelo admin travam, o update
 * manda apenas o diff, e o conjunto travado é filtrado pelos campos lockáveis.
 */
function makePrisma(existing: Record<string, unknown> | null) {
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "p1", ...data }));
  return {
    prisma: {
      product: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update,
      },
    } as never,
    update,
  };
}

describe("AdminCatalogService.listProducts", () => {
  function makeListPrisma() {
    const findMany = jest.fn().mockResolvedValue([{ id: "p1" }]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      product: { findMany, count },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as never;
    return { prisma, findMany, count };
  }

  it("clampa paginação e ordena por completude e nome", async () => {
    const { prisma, findMany } = makeListPrisma();
    const res = await new AdminCatalogService(prisma).listProducts({ pageSize: 999 });
    expect(res.pageSize).toBe(100);
    expect(res.total).toBe(1);
    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { completenessScore: "asc" },
      { name: "asc" },
    ]);
    expect(findMany.mock.calls[0][0].where).toEqual({});
  });

  it("monta where de busca (nome/marca/gtin) e status", async () => {
    const { prisma, findMany } = makeListPrisma();
    await new AdminCatalogService(prisma).listProducts({ search: "arroz", status: "pending" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.enrichmentStatus).toBe("pending");
    expect(where.OR).toHaveLength(3);
  });
});

describe("AdminCatalogService.productDetail", () => {
  it("lança PRODUCT_NOT_FOUND quando ausente", async () => {
    const { prisma } = makePrisma(null);
    await expect(new AdminCatalogService(prisma).productDetail("p1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("retorna o produto com ofertas/enrichment quando existe", async () => {
    const { prisma } = makePrisma({ id: "p1", offers: [] });
    const res = await new AdminCatalogService(prisma).productDetail("p1");
    expect(res).toMatchObject({ id: "p1" });
  });
});

describe("AdminCatalogService.updateProduct", () => {
  it("lança PRODUCT_NOT_FOUND quando o produto não existe", async () => {
    const { prisma } = makePrisma(null);
    const svc = new AdminCatalogService(prisma);
    await expect(svc.updateProduct("p1", { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("trava só os campos enviados e manda apenas o diff", async () => {
    const { prisma, update } = makePrisma({ id: "p1", lockedFields: [] });
    const svc = new AdminCatalogService(prisma);
    await svc.updateProduct("p1", { name: "Arroz" });

    const { data } = update.mock.calls[0][0];
    expect(data.name).toBe("Arroz");
    expect(data).not.toHaveProperty("brand");
    expect(data).not.toHaveProperty("imageUrl");
    expect(data.lockedFields).toEqual(["name"]);
  });

  it("acumula os locks já existentes sem duplicar", async () => {
    const { prisma, update } = makePrisma({ id: "p1", lockedFields: ["brand"] });
    const svc = new AdminCatalogService(prisma);
    await svc.updateProduct("p1", { name: "Arroz", brand: "Tio João" });

    const { data } = update.mock.calls[0][0];
    expect([...data.lockedFields].sort()).toEqual(["brand", "name"]);
  });

  it("categoryId define connect; null vira disconnect; ambos travam 'category'", async () => {
    const connect = makePrisma({ id: "p1", lockedFields: [] });
    await new AdminCatalogService(connect.prisma).updateProduct("p1", { categoryId: "c1" });
    expect(connect.update.mock.calls[0][0].data.category).toEqual({ connect: { id: "c1" } });
    expect(connect.update.mock.calls[0][0].data.lockedFields).toContain("category");

    const disc = makePrisma({ id: "p1", lockedFields: [] });
    await new AdminCatalogService(disc.prisma).updateProduct("p1", { categoryId: null });
    expect(disc.update.mock.calls[0][0].data.category).toEqual({ disconnect: true });
  });

  it("filtra lockedFields para apenas campos lockáveis (descarta lixo herdado)", async () => {
    const { prisma, update } = makePrisma({ id: "p1", lockedFields: ["gtin", "completenessScore"] });
    const svc = new AdminCatalogService(prisma);
    await svc.updateProduct("p1", { name: "x" });

    const { data } = update.mock.calls[0][0];
    expect(data.lockedFields).toEqual(["name"]); // gtin/completenessScore não são lockáveis
  });
});

describe("AdminCatalogService.unlockFields", () => {
  it("remove os campos pedidos do lockedFields", async () => {
    const { prisma, update } = makePrisma({ id: "p1", lockedFields: ["name", "brand", "imageUrl"] });
    const svc = new AdminCatalogService(prisma);
    await svc.unlockFields("p1", ["brand"]);
    expect(update.mock.calls[0][0].data.lockedFields).toEqual(["name", "imageUrl"]);
  });
});
