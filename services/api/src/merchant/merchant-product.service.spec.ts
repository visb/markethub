import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MerchantProductService } from "./merchant-product.service";

/**
 * Foco C09: edição de produto pelo manager (S3.10) — update diff-only que
 * acumula lockedFields só dos campos enviados (enrichment não sobrescreve) e
 * trata connect/disconnect de categoria. assertCanEdit via createdById.
 */
function makeService(product: Record<string, unknown> | null) {
  const update = jest.fn().mockResolvedValue({ id: "p1" });
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      findUniqueOrThrow: jest.fn().mockResolvedValue(product),
      update,
    },
    offer: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
  const merchant = { managerStoreIds: jest.fn().mockResolvedValue([]) } as never;
  const storage = {} as never;
  return { svc: new MerchantProductService(prisma, merchant, storage), update };
}

const base = { id: "p1", lockedFields: ["name", "saleType"], createdById: "u1" };

describe("MerchantProductService.update", () => {
  it("PRODUCT_NOT_FOUND quando o produto não existe", async () => {
    const { svc } = makeService(null);
    await expect(svc.update("u1", "p1", { brand: "X" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("NO_FIELDS quando nenhum campo é enviado", async () => {
    const { svc } = makeService({ ...base });
    await expect(svc.update("u1", "p1", {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NO_FIELDS" }),
    });
  });

  it("NAME_REQUIRED quando name vem vazio", async () => {
    const { svc } = makeService({ ...base });
    await expect(svc.update("u1", "p1", { name: "  " })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NAME_REQUIRED" }),
    });
  });

  it("diff-only: grava só o campo enviado e acumula o lock", async () => {
    const { svc, update } = makeService({ ...base });
    await svc.update("u1", "p1", { brand: "Marca" });
    const { data } = update.mock.calls[0][0];
    expect(data.brand).toBe("Marca");
    expect(data).not.toHaveProperty("name"); // não enviado → não toca
    expect(new Set(data.lockedFields)).toEqual(new Set(["name", "saleType", "brand"]));
  });

  it("categoryId definido → connect e trava category", async () => {
    const { svc, update } = makeService({ ...base });
    await svc.update("u1", "p1", { categoryId: "c1" });
    const { data } = update.mock.calls[0][0];
    expect(data.category).toEqual({ connect: { id: "c1" } });
    expect(data.lockedFields).toContain("category");
  });

  it("categoryId null → disconnect", async () => {
    const { svc, update } = makeService({ ...base });
    await svc.update("u1", "p1", { categoryId: null });
    expect(update.mock.calls[0][0].data.category).toEqual({ disconnect: true });
  });
});

// ── Story 43: uploadUrl, create (dedup/attachOffer/warnings) e guardas ──

/** Fake completo p/ os fluxos de criação (S3.10). */
function makeFull(opts: {
  managed?: string[];
  productByGtin?: Record<string, unknown> | null;
  offerExists?: Record<string, unknown> | null;
  similar?: unknown[];
}) {
  const productCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "pNew", ...data }));
  const offerCreate = jest.fn().mockResolvedValue({ id: "oNew" });
  const stockUpsert = jest.fn().mockResolvedValue({ id: "kNew" });
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(opts.productByGtin ?? null),
      findMany: jest.fn().mockResolvedValue(opts.similar ?? []),
      create: productCreate,
    },
    offer: {
      findUnique: jest.fn().mockResolvedValue(opts.offerExists ?? null),
      create: offerCreate,
    },
    stock: { upsert: stockUpsert },
  } as never;
  const merchant = {
    managerStoreIds: jest.fn().mockResolvedValue(opts.managed ?? ["s1"]),
  } as never;
  const storage = {
    presignUpload: jest.fn().mockResolvedValue({ url: "http://upload", key: "k" }),
  } as never;
  return {
    svc: new MerchantProductService(prisma, merchant, storage),
    productCreate,
    offerCreate,
    stockUpsert,
    storage,
  };
}

describe("MerchantProductService.uploadUrl", () => {
  it("sanitiza o nome e pede URL ao storage", async () => {
    const { svc, storage } = makeFull({ managed: ["s1"] });
    const out = await svc.uploadUrl("u1", "foto do produto!.png", "image/png");
    expect(out).toEqual({ url: "http://upload", key: "k" });
    const key = (storage as unknown as { presignUpload: jest.Mock }).presignUpload.mock.calls[0][0];
    expect(key).toMatch(/^products\/.*foto_do_produto_\.png$/);
  });

  it("sem loja gerida → NOT_A_MANAGER", async () => {
    const { svc } = makeFull({ managed: [] });
    await expect(svc.uploadUrl("u1", "f.png", "image/png")).rejects.toMatchObject({
      response: { code: "NOT_A_MANAGER" },
    });
  });
});

describe("MerchantProductService.create", () => {
  const input = { storeId: "s1", name: "Arroz", priceCents: 500 };

  it("loja não gerida → STORE_NOT_MANAGED", async () => {
    const { svc } = makeFull({ managed: ["outra"] });
    await expect(svc.create("u1", input)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("nome vazio → NAME_REQUIRED", async () => {
    const { svc } = makeFull({ managed: ["s1"] });
    await expect(svc.create("u1", { ...input, name: "  " })).rejects.toMatchObject({
      response: { code: "NAME_REQUIRED" },
    });
  });

  it("preço inválido → INVALID_PRICE", async () => {
    const { svc } = makeFull({ managed: ["s1"] });
    await expect(svc.create("u1", { ...input, priceCents: -1 })).rejects.toMatchObject({
      response: { code: "INVALID_PRICE" },
    });
  });

  it("dedup por GTIN reusa o canônico (reused:true) e cria só a oferta", async () => {
    const { svc, productCreate, offerCreate } = makeFull({
      managed: ["s1"],
      productByGtin: { id: "pExist", gtin: "7891234567895" },
    });
    const out = await svc.create("u1", { ...input, gtin: "7891234567895" });
    expect(out.reused).toBe(true);
    expect(out.product).toMatchObject({ id: "pExist" });
    expect(productCreate).not.toHaveBeenCalled();
    expect(offerCreate).toHaveBeenCalled();
  });

  it("sem GTIN cria produto novo e devolve warnings de similaridade", async () => {
    const { svc, productCreate } = makeFull({
      managed: ["s1"],
      similar: [{ id: "p9", name: "Arroz Tio", brand: null }],
    });
    const out = await svc.create("u1", input);
    expect(out.reused).toBe(false);
    expect(out.warnings).toEqual([{ productId: "p9", name: "Arroz Tio", brand: null }]);
    const data = productCreate.mock.calls[0][0].data;
    expect(data.source).toBe("merchant");
    expect(data.lockedFields).toEqual(expect.arrayContaining(["name", "saleType"]));
  });

  it("lockedFromCreate inclui os campos informados manualmente", async () => {
    const { svc, productCreate } = makeFull({ managed: ["s1"] });
    await svc.create("u1", {
      ...input,
      brand: "Tio João",
      packageSize: "1kg",
      imageUrl: "http://x/i.png",
      categoryId: "c1",
    });
    const locked = productCreate.mock.calls[0][0].data.lockedFields;
    expect(locked).toEqual(expect.arrayContaining(["name", "saleType", "brand", "packageSize", "imageUrl", "category"]));
  });

  it("attachOffer recusa oferta duplicada na loja → OFFER_EXISTS", async () => {
    const { svc } = makeFull({ managed: ["s1"], offerExists: { id: "oExist" } });
    await expect(svc.create("u1", input)).rejects.toMatchObject({
      response: { code: "OFFER_EXISTS" },
    });
  });
});
