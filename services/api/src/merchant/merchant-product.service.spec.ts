import { BadRequestException, NotFoundException } from "@nestjs/common";
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
