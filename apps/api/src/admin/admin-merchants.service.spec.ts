import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AdminMerchantsService } from "./admin-merchants.service";

/** Fake mínimo do PrismaService p/ o service de navegação admin. */
function makePrisma(over: Record<string, unknown> = {}) {
  return {
    merchant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    store: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    offer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    stock: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    storeStaff: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    order: { groupBy: jest.fn() },
    $transaction: jest.fn(),
    ...over,
  } as never;
}

describe("AdminMerchantsService.listMerchants", () => {
  it("mapeia storeCount a partir de _count", async () => {
    const prisma = makePrisma({
      merchant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m1",
            name: "Europa",
            slug: "europa",
            active: true,
            deliveryFeeCents: 700,
            platformFeeBps: 1000,
            _count: { stores: 2 },
          },
        ]),
      },
    });
    const svc = new AdminMerchantsService(prisma);
    const out = await svc.listMerchants();
    expect(out).toEqual([
      {
        id: "m1",
        name: "Europa",
        slug: "europa",
        active: true,
        deliveryFeeCents: 700,
        platformFeeBps: 1000,
        storeCount: 2,
      },
    ]);
  });
});

describe("AdminMerchantsService.createMerchant", () => {
  it("gera slug do nome quando não informado", async () => {
    const create = jest.fn().mockResolvedValue({ id: "m1" });
    const prisma = makePrisma({
      merchant: { findUnique: jest.fn().mockResolvedValue(null), create },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.createMerchant({ name: "Supermercado São José" });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "supermercado-sao-jose" }) }),
    );
  });

  it("recusa slug duplicado", async () => {
    const prisma = makePrisma({
      merchant: { findUnique: jest.fn().mockResolvedValue({ id: "other" }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.createMerchant({ name: "Europa" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("recusa nome vazio", async () => {
    const svc = new AdminMerchantsService(makePrisma());
    await expect(svc.createMerchant({ name: "   " })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AdminMerchantsService.createStore", () => {
  it("falha se o mercado não existe", async () => {
    const prisma = makePrisma({
      merchant: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(
      svc.createStore({ merchantId: "x", name: "Loja" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AdminMerchantsService.updateOffer", () => {
  it("trava priceCents ao editar manualmente", async () => {
    const update = jest.fn().mockResolvedValue({ id: "o1", priceCents: 199, lockedFields: ["priceCents"] });
    const prisma = makePrisma({
      offer: {
        findUnique: jest.fn().mockResolvedValue({ id: "o1", lockedFields: [] }),
        update,
      },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateOffer("o1", { priceCents: 199 }, "admin1");
    const arg = update.mock.calls[0][0];
    expect(arg.data.priceCents).toBe(199);
    expect(arg.data.lockedFields).toContain("priceCents");
    expect(arg.data.updatedById).toBe("admin1");
  });

  it("rejeita preço negativo", async () => {
    const prisma = makePrisma({
      offer: { findUnique: jest.fn().mockResolvedValue({ id: "o1", lockedFields: [] }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateOffer("o1", { priceCents: -5 }, "a")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("404 se a oferta não existe", async () => {
    const prisma = makePrisma({ offer: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateOffer("x", { available: true }, "a")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("AdminMerchantsService.removeStaff", () => {
  it("remove vínculo existente", async () => {
    const del = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({
      storeStaff: { findUnique: jest.fn().mockResolvedValue({ id: "s1" }), delete: del },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.removeStaff("s1")).resolves.toEqual({ removed: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("404 se vínculo não existe", async () => {
    const prisma = makePrisma({
      storeStaff: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.removeStaff("x")).rejects.toBeInstanceOf(NotFoundException);
  });
});
