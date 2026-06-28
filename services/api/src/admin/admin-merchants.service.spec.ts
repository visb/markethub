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
    storeHours: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    order: { groupBy: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
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

describe("AdminMerchantsService.updateStore (phone/allowsPickup — story 29)", () => {
  it("grava só os campos enviados (phone/allowsPickup); ausentes não viram update", async () => {
    const update = jest.fn().mockResolvedValue({ id: "st1" });
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }), update },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateStore("st1", { phone: "(41) 99999-0000", allowsPickup: false });
    const data = update.mock.calls[0][0].data;
    expect(data).toEqual({ phone: "(41) 99999-0000", allowsPickup: false });
  });

  it("phone vazio vira null (limpa o contato)", async () => {
    const update = jest.fn().mockResolvedValue({ id: "st1" });
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }), update },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateStore("st1", { phone: "" });
    expect(update.mock.calls[0][0].data).toEqual({ phone: null });
  });

  it("nenhum campo → NO_FIELDS", async () => {
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }), update: jest.fn() },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateStore("st1", {})).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AdminMerchantsService.setStoreHours (story 29)", () => {
  function prismaWithStore(hoursAfter: unknown[] = []) {
    const deleteMany = jest.fn();
    const createMany = jest.fn();
    const findMany = jest.fn().mockResolvedValue(hoursAfter);
    const $transaction = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }) },
      storeHours: { deleteMany, createMany, findMany },
      $transaction,
    });
    return { prisma, deleteMany, createMany, findMany, $transaction };
  }

  it("substitui o horário (delete + createMany) e devolve as linhas", async () => {
    const rows = [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }];
    const { prisma, findMany } = prismaWithStore(rows);
    const svc = new AdminMerchantsService(prisma);
    const out = await svc.setStoreHours("st1", [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }]);
    expect(out).toEqual(rows);
    expect(findMany).toHaveBeenCalled();
  });

  it("lista vazia limpa o horário sem createMany", async () => {
    const { prisma, createMany } = prismaWithStore([]);
    const svc = new AdminMerchantsService(prisma);
    await svc.setStoreHours("st1", []);
    // createMany não é incluído na transação quando não há faixas
    expect(createMany).not.toHaveBeenCalled();
  });

  it("recusa closesAt ≤ opensAt → INVALID_HOURS", async () => {
    const { prisma } = prismaWithStore();
    const svc = new AdminMerchantsService(prisma);
    await expect(
      svc.setStoreHours("st1", [{ dayOfWeek: 1, opensAt: 600, closesAt: 600 }]),
    ).rejects.toMatchObject({ response: { code: "INVALID_HOURS" } });
  });

  it("recusa dia da semana repetido → DUPLICATE_DAY", async () => {
    const { prisma } = prismaWithStore();
    const svc = new AdminMerchantsService(prisma);
    await expect(
      svc.setStoreHours("st1", [
        { dayOfWeek: 2, opensAt: 480, closesAt: 720 },
        { dayOfWeek: 2, opensAt: 800, closesAt: 1000 },
      ]),
    ).rejects.toMatchObject({ response: { code: "DUPLICATE_DAY" } });
  });

  it("404 se a loja não existe", async () => {
    const prisma = makePrisma({ store: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.setStoreHours("x", [])).rejects.toBeInstanceOf(NotFoundException);
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
