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
