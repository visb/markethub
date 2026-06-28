import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { MarketplaceCategoryService } from "./marketplace-category.service";

/**
 * Categoria de marketplace (curadoria do admin): árvore curada, mapeamento de
 * categorias cruas (ERP/Cosmos) e CRUD. Sem DB — Prisma mockado.
 */
function makePrisma() {
  const marketplaceCategory = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "mc1", ...data })),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "mc1", ...data })),
    delete: jest.fn().mockResolvedValue({ id: "mc1" }),
  };
  const category = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data })),
    updateMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  const prisma = { marketplaceCategory, category } as never;
  return { prisma, marketplaceCategory, category };
}

describe("MarketplaceCategoryService.listAdmin", () => {
  it("traz todas ordenadas com contagem de categorias cruas vinculadas", () => {
    const { prisma, marketplaceCategory } = makePrisma();
    marketplaceCategory.findMany.mockResolvedValue([{ id: "mc1" }]);
    new MarketplaceCategoryService(prisma).listAdmin();
    expect(marketplaceCategory.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { rawCategories: true } } },
    });
  });
});

describe("MarketplaceCategoryService.listPublic", () => {
  it("filtra só as visíveis, ordenadas", () => {
    const { prisma, marketplaceCategory } = makePrisma();
    new MarketplaceCategoryService(prisma).listPublic();
    const args = marketplaceCategory.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ visible: true });
    expect(args.orderBy).toEqual([{ displayOrder: "asc" }, { name: "asc" }]);
  });
});

describe("MarketplaceCategoryService.create", () => {
  it("exige nome (rejeita vazio/espacos)", async () => {
    const { prisma } = makePrisma();
    const svc = new MarketplaceCategoryService(prisma);
    await expect(svc.create({ name: "   " })).rejects.toMatchObject({
      response: { code: "NAME_REQUIRED" },
    });
  });

  it("gera slug e aplica defaults (displayOrder=0, visible=true, parentId=null)", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    await new MarketplaceCategoryService(prisma).create({ name: "Bebidas & Sucos" });
    const { data } = marketplaceCategory.create.mock.calls[0][0];
    expect(data).toMatchObject({
      name: "Bebidas & Sucos",
      slug: "bebidas-sucos",
      displayOrder: 0,
      visible: true,
      parentId: null,
    });
  });

  it("respeita parentId/displayOrder/visible informados (subcategoria na árvore)", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    await new MarketplaceCategoryService(prisma).create({
      name: "Refrigerantes",
      parentId: "mc-pai",
      displayOrder: 3,
      visible: false,
    });
    const { data } = marketplaceCategory.create.mock.calls[0][0];
    expect(data).toMatchObject({ parentId: "mc-pai", displayOrder: 3, visible: false });
  });
});

describe("MarketplaceCategoryService.update", () => {
  it("lança MKT_CATEGORY_NOT_FOUND quando o id não existe", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    marketplaceCategory.findUnique.mockResolvedValue(null);
    await expect(
      new MarketplaceCategoryService(prisma).update("mc1", { name: "x" }),
    ).rejects.toMatchObject({ response: { code: "MKT_CATEGORY_NOT_FOUND" } });
  });

  it("renomeia recomputando o slug e manda só o diff", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    marketplaceCategory.findUnique.mockResolvedValue({ id: "mc1" });
    await new MarketplaceCategoryService(prisma).update("mc1", { name: "Hortifruti" });
    const { data } = marketplaceCategory.update.mock.calls[0][0];
    expect(data).toEqual({ name: "Hortifruti", slug: "hortifruti" });
  });

  it("displayOrder/visible/parentId entram quando definidos (inclusive null)", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    marketplaceCategory.findUnique.mockResolvedValue({ id: "mc1" });
    await new MarketplaceCategoryService(prisma).update("mc1", {
      displayOrder: 0,
      visible: false,
      parentId: null,
    });
    const { data } = marketplaceCategory.update.mock.calls[0][0];
    expect(data).toEqual({ displayOrder: 0, visible: false, parentId: null });
  });

  it("prepOptions definido grava o objeto; null vira JsonNull", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    marketplaceCategory.findUnique.mockResolvedValue({ id: "mc1" });
    const svc = new MarketplaceCategoryService(prisma);

    await svc.update("mc1", { prepOptions: { label: "Como?", options: ["a"] } });
    expect(marketplaceCategory.update.mock.calls[0][0].data.prepOptions).toEqual({
      label: "Como?",
      options: ["a"],
    });

    await svc.update("mc1", { prepOptions: null });
    expect(marketplaceCategory.update.mock.calls[1][0].data.prepOptions).toBe(Prisma.JsonNull);
  });
});

describe("MarketplaceCategoryService.remove", () => {
  it("lança MKT_CATEGORY_NOT_FOUND quando ausente", async () => {
    const { prisma, marketplaceCategory } = makePrisma();
    marketplaceCategory.findUnique.mockResolvedValue(null);
    await expect(new MarketplaceCategoryService(prisma).remove("mc1")).rejects.toMatchObject({
      response: { code: "MKT_CATEGORY_NOT_FOUND" },
    });
  });

  it("desvincula categorias cruas antes de deletar", async () => {
    const { prisma, marketplaceCategory, category } = makePrisma();
    marketplaceCategory.findUnique.mockResolvedValue({ id: "mc1" });
    const res = await new MarketplaceCategoryService(prisma).remove("mc1");
    expect(category.updateMany).toHaveBeenCalledWith({
      where: { marketplaceCategoryId: "mc1" },
      data: { marketplaceCategoryId: null },
    });
    expect(marketplaceCategory.delete).toHaveBeenCalledWith({ where: { id: "mc1" } });
    expect(res).toEqual({ id: "mc1", deleted: true });
  });
});

describe("MarketplaceCategoryService.listRawCategories", () => {
  it("traz cruas com mapeamento atual e contagem de produtos", () => {
    const { prisma, category } = makePrisma();
    new MarketplaceCategoryService(prisma).listRawCategories();
    const args = category.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ name: "asc" });
    expect(args.select).toMatchObject({ marketplaceCategoryId: true });
  });
});

describe("MarketplaceCategoryService.assignRaw", () => {
  it("lança CATEGORY_NOT_FOUND quando a categoria crua não existe", async () => {
    const { prisma, category } = makePrisma();
    category.findUnique.mockResolvedValue(null);
    await expect(
      new MarketplaceCategoryService(prisma).assignRaw("c1", "mc1"),
    ).rejects.toMatchObject({ response: { code: "CATEGORY_NOT_FOUND" } });
  });

  it("valida a curada de destino e vincula", async () => {
    const { prisma, category, marketplaceCategory } = makePrisma();
    category.findUnique.mockResolvedValue({ id: "c1" });
    marketplaceCategory.findUnique.mockResolvedValue({ id: "mc1" });
    await new MarketplaceCategoryService(prisma).assignRaw("c1", "mc1");
    expect(marketplaceCategory.findUnique).toHaveBeenCalled(); // assertExists do destino
    expect(category.update.mock.calls[0][0].data).toEqual({ marketplaceCategoryId: "mc1" });
  });

  it("propaga MKT_CATEGORY_NOT_FOUND quando a curada de destino não existe", async () => {
    const { prisma, category, marketplaceCategory } = makePrisma();
    category.findUnique.mockResolvedValue({ id: "c1" });
    marketplaceCategory.findUnique.mockResolvedValue(null);
    await expect(
      new MarketplaceCategoryService(prisma).assignRaw("c1", "mc1"),
    ).rejects.toMatchObject({ response: { code: "MKT_CATEGORY_NOT_FOUND" } });
  });

  it("desvincula (null) sem validar destino", async () => {
    const { prisma, category, marketplaceCategory } = makePrisma();
    category.findUnique.mockResolvedValue({ id: "c1" });
    await new MarketplaceCategoryService(prisma).assignRaw("c1", null);
    expect(marketplaceCategory.findUnique).not.toHaveBeenCalled();
    expect(category.update.mock.calls[0][0].data).toEqual({ marketplaceCategoryId: null });
  });
});
