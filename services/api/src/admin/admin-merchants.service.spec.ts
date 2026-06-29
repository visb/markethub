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

// ── Story 43: cobertura dos métodos restantes ──

describe("AdminMerchantsService.merchantDetail", () => {
  it("404 quando o mercado não existe", async () => {
    const prisma = makePrisma({ merchant: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.merchantDetail("x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("mapeia o contador de ofertas/staff por loja", async () => {
    const prisma = makePrisma({
      merchant: {
        findUnique: jest.fn().mockResolvedValue({
          id: "m1",
          name: "Europa",
          slug: "europa",
          active: true,
          stores: [
            { id: "s1", name: "L1", city: "Curitiba", state: "PR", active: true, _count: { offers: 3, staff: 2 } },
          ],
        }),
      },
    });
    const svc = new AdminMerchantsService(prisma);
    const out = await svc.merchantDetail("m1");
    expect(out.stores).toEqual([
      { id: "s1", name: "L1", city: "Curitiba", state: "PR", active: true, offerCount: 3, staffCount: 2 },
    ]);
  });
});

describe("AdminMerchantsService.createMerchant (campos de taxa)", () => {
  it("inclui deliveryFeeCents/prepFeeCents/platformFeeBps/active quando informados", async () => {
    const create = jest.fn().mockResolvedValue({ id: "m1" });
    const prisma = makePrisma({
      merchant: { findUnique: jest.fn().mockResolvedValue(null), create },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.createMerchant({
      name: "Europa",
      slug: "europa-rede",
      deliveryFeeCents: 700,
      prepFeeCents: 200,
      platformFeeBps: 1000,
      active: false,
    });
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      slug: "europa-rede",
      deliveryFeeCents: 700,
      prepFeeCents: 200,
      platformFeeBps: 1000,
      active: false,
    });
  });
});

describe("AdminMerchantsService.updateMerchant", () => {
  function prismaWith(merchant: Record<string, unknown> | null, clash: Record<string, unknown> | null = null) {
    const update = jest.fn().mockResolvedValue({ id: "m1" });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(merchant) // busca por id
      .mockResolvedValue(clash); // busca por slug
    return { prisma: makePrisma({ merchant: { findUnique, update } }), update };
  }

  it("404 quando o mercado não existe", async () => {
    const { prisma } = prismaWith(null);
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateMerchant("x", { name: "N" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("nome vazio → INVALID_NAME", async () => {
    const { prisma } = prismaWith({ id: "m1" });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateMerchant("m1", { name: "  " })).rejects.toMatchObject({
      response: { code: "INVALID_NAME" },
    });
  });

  it("slug que normaliza vazio → INVALID_SLUG", async () => {
    const { prisma } = prismaWith({ id: "m1" });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateMerchant("m1", { slug: "!!!" })).rejects.toMatchObject({
      response: { code: "INVALID_SLUG" },
    });
  });

  it("slug em uso por outro mercado → SLUG_TAKEN", async () => {
    const { prisma } = prismaWith({ id: "m1" }, { id: "outro" });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateMerchant("m1", { slug: "europa" })).rejects.toMatchObject({
      response: { code: "SLUG_TAKEN" },
    });
  });

  it("slug pertencente ao próprio mercado é aceito", async () => {
    const { prisma, update } = prismaWith({ id: "m1" }, { id: "m1" });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateMerchant("m1", { slug: "europa" });
    expect(update.mock.calls[0][0].data.slug).toBe("europa");
  });

  it("grava logoUrl/fees/active e o nome aparado", async () => {
    const { prisma, update } = prismaWith({ id: "m1" });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateMerchant("m1", {
      name: "  Europa  ",
      logoUrl: "http://x/l.png",
      deliveryFeeCents: 500,
      prepFeeCents: 100,
      platformFeeBps: 800,
      active: true,
    });
    expect(update.mock.calls[0][0].data).toMatchObject({
      name: "Europa",
      logoUrl: "http://x/l.png",
      deliveryFeeCents: 500,
      prepFeeCents: 100,
      platformFeeBps: 800,
      active: true,
    });
  });

  it("patch vazio → NO_FIELDS", async () => {
    const { prisma } = prismaWith({ id: "m1" });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateMerchant("m1", {})).rejects.toMatchObject({
      response: { code: "NO_FIELDS" },
    });
  });
});

describe("AdminMerchantsService.createStore (sucesso)", () => {
  it("cria com defaults null e os campos informados", async () => {
    const create = jest.fn().mockResolvedValue({ id: "s1" });
    const prisma = makePrisma({
      merchant: { findUnique: jest.fn().mockResolvedValue({ id: "m1" }) },
      store: { create },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.createStore({ merchantId: "m1", name: " Loja ", city: "Curitiba", active: false });
    const data = create.mock.calls[0][0].data;
    expect(data.name).toBe("Loja");
    expect(data.city).toBe("Curitiba");
    expect(data.street).toBeNull();
    expect(data.active).toBe(false);
  });

  it("nome vazio → INVALID_NAME", async () => {
    const prisma = makePrisma({
      merchant: { findUnique: jest.fn().mockResolvedValue({ id: "m1" }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.createStore({ merchantId: "m1", name: "  " })).rejects.toMatchObject({
      response: { code: "INVALID_NAME" },
    });
  });
});

describe("AdminMerchantsService.updateStore (campos de endereço)", () => {
  it("grava os campos enviados e zera externalId vazio", async () => {
    const update = jest.fn().mockResolvedValue({ id: "st1" });
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }), update },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateStore("st1", {
      name: " Loja Nova ",
      externalId: "",
      street: "Rua A",
      latitude: -25,
      avgPrepMinutes: 20,
      active: true,
    });
    const data = update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: "Loja Nova",
      externalId: null,
      street: "Rua A",
      latitude: -25,
      avgPrepMinutes: 20,
      active: true,
    });
  });

  it("nome aparado vazio → INVALID_NAME", async () => {
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }), update: jest.fn() },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateStore("st1", { name: "  " })).rejects.toMatchObject({
      response: { code: "INVALID_NAME" },
    });
  });

  it("404 se a loja não existe (assertStoreExists)", async () => {
    const prisma = makePrisma({ store: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateStore("x", { name: "N" })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AdminMerchantsService.storeDetail", () => {
  it("404 quando a loja não existe", async () => {
    const prisma = makePrisma({ store: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.storeDetail("x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("agrega counts e ordersByStatus", async () => {
    const prisma = makePrisma({
      store: {
        findUnique: jest.fn().mockResolvedValue({
          id: "st1",
          name: "L1",
          merchant: { id: "m1", name: "Europa" },
          hours: [],
          _count: { offers: 5, staff: 2, deliverySlots: 3 },
        }),
      },
      order: {
        groupBy: jest.fn().mockResolvedValue([
          { status: "delivered", _count: { _all: 7 } },
          { status: "placed", _count: { _all: 1 } },
        ]),
      },
    });
    const svc = new AdminMerchantsService(prisma);
    const out = await svc.storeDetail("st1");
    expect(out.counts).toEqual({
      offers: 5,
      staff: 2,
      slots: 3,
      ordersByStatus: { delivered: 7, placed: 1 },
    });
  });
});

describe("AdminMerchantsService.setStoreActive", () => {
  it("404 se a loja não existe", async () => {
    const prisma = makePrisma({ store: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.setStoreActive("x", true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("atualiza o flag active", async () => {
    const update = jest.fn().mockResolvedValue({ id: "st1", active: false });
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }), update },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.setStoreActive("st1", false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "st1" }, data: { active: false } }),
    );
  });
});

describe("AdminMerchantsService.storeHours", () => {
  it("404 se a loja não existe", async () => {
    const prisma = makePrisma({ store: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.storeHours("x")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lista as faixas da loja", async () => {
    const rows = [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }];
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }) },
      storeHours: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const svc = new AdminMerchantsService(prisma);
    expect(await svc.storeHours("st1")).toEqual(rows);
  });
});

describe("AdminMerchantsService.storeOffers", () => {
  function prismaWithOffers() {
    const offers = [
      {
        id: "o1",
        storeId: "st1",
        productId: "p1",
        priceCents: 199,
        promoPriceCents: null,
        available: true,
        lockedFields: [],
        product: { id: "p1", name: "Leite", brand: "X", imageUrl: null, saleType: "unit", categoryId: "c1" },
      },
    ];
    return makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }) },
      offer: { findMany: jest.fn().mockResolvedValue(offers), count: jest.fn().mockResolvedValue(1) },
      stock: {
        findMany: jest.fn().mockResolvedValue([
          { id: "k1", storeId: "st1", productId: "p1", quantity: 10, available: true, lockedFields: [] },
        ]),
      },
      $transaction: jest.fn().mockResolvedValue([offers, 1]),
    });
  }

  it("404 se a loja não existe", async () => {
    const prisma = makePrisma({ store: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.storeOffers("x", {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("anexa o estoque por store+product e devolve paginação", async () => {
    const svc = new AdminMerchantsService(prismaWithOffers());
    const out = await svc.storeOffers("st1", { page: 1, pageSize: 20 });
    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.items[0].stock).toMatchObject({ id: "k1", quantity: 10 });
  });

  it("aplica filtros de categoria/busca/disponibilidade", async () => {
    const prisma = prismaWithOffers();
    const svc = new AdminMerchantsService(prisma);
    const out = await svc.storeOffers("st1", { categoryId: "c1", search: "leite", available: true });
    expect(out.items).toHaveLength(1);
  });
});

describe("AdminMerchantsService.unlockOffer", () => {
  it("404 se a oferta não existe", async () => {
    const prisma = makePrisma({ offer: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.unlockOffer("x", "priceCents", "a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("campo não travável → INVALID_FIELD", async () => {
    const prisma = makePrisma({
      offer: { findUnique: jest.fn().mockResolvedValue({ id: "o1", lockedFields: ["priceCents"] }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.unlockOffer("o1", "weird", "a")).rejects.toMatchObject({
      response: { code: "INVALID_FIELD" },
    });
  });

  it("remove o campo travado", async () => {
    const update = jest.fn().mockResolvedValue({ id: "o1" });
    const prisma = makePrisma({
      offer: {
        findUnique: jest.fn().mockResolvedValue({ id: "o1", lockedFields: ["priceCents", "available"] }),
        update,
      },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.unlockOffer("o1", "priceCents", "admin1");
    expect(update.mock.calls[0][0].data.lockedFields).toEqual(["available"]);
  });
});

describe("AdminMerchantsService.updateStock", () => {
  it("404 se o estoque não existe", async () => {
    const prisma = makePrisma({ stock: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateStock("x", { quantity: 1 }, "a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("quantity negativo → INVALID_QUANTITY", async () => {
    const prisma = makePrisma({
      stock: { findUnique: jest.fn().mockResolvedValue({ id: "k1", lockedFields: [] }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateStock("k1", { quantity: -1 }, "a")).rejects.toMatchObject({
      response: { code: "INVALID_QUANTITY" },
    });
  });

  it("quantity null é aceito e trava o campo", async () => {
    const update = jest.fn().mockResolvedValue({ id: "k1" });
    const prisma = makePrisma({
      stock: { findUnique: jest.fn().mockResolvedValue({ id: "k1", lockedFields: [] }), update },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.updateStock("k1", { quantity: null, available: true }, "admin1");
    const data = update.mock.calls[0][0].data;
    expect(data.quantity).toBeNull();
    expect(data.lockedFields).toEqual(expect.arrayContaining(["quantity", "available"]));
  });

  it("patch vazio → NO_FIELDS", async () => {
    const prisma = makePrisma({
      stock: { findUnique: jest.fn().mockResolvedValue({ id: "k1", lockedFields: [] }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.updateStock("k1", {}, "a")).rejects.toMatchObject({
      response: { code: "NO_FIELDS" },
    });
  });
});

describe("AdminMerchantsService.unlockStock", () => {
  it("404 se o estoque não existe", async () => {
    const prisma = makePrisma({ stock: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.unlockStock("x", "quantity", "a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("campo não travável → INVALID_FIELD", async () => {
    const prisma = makePrisma({
      stock: { findUnique: jest.fn().mockResolvedValue({ id: "k1", lockedFields: ["quantity"] }) },
    });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.unlockStock("k1", "weird", "a")).rejects.toMatchObject({
      response: { code: "INVALID_FIELD" },
    });
  });

  it("remove o campo travado", async () => {
    const update = jest.fn().mockResolvedValue({ id: "k1" });
    const prisma = makePrisma({
      stock: {
        findUnique: jest.fn().mockResolvedValue({ id: "k1", lockedFields: ["quantity", "available"] }),
        update,
      },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.unlockStock("k1", "quantity", "admin1");
    expect(update.mock.calls[0][0].data.lockedFields).toEqual(["available"]);
  });
});

describe("AdminMerchantsService.storeStaff / setStaffActive", () => {
  it("storeStaff mapeia o vínculo + usuário", async () => {
    const prisma = makePrisma({
      store: { findUnique: jest.fn().mockResolvedValue({ id: "st1" }) },
      storeStaff: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "ss1",
            staffRole: "manager",
            active: true,
            createdAt: new Date("2026-01-01"),
            user: { id: "u1", name: "Ana", email: "a@x.com", active: true },
          },
        ]),
      },
    });
    const svc = new AdminMerchantsService(prisma);
    const out = await svc.storeStaff("st1");
    expect(out[0]).toMatchObject({ id: "ss1", staffRole: "manager", user: { id: "u1" } });
  });

  it("setStaffActive 404 se vínculo não existe", async () => {
    const prisma = makePrisma({ storeStaff: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AdminMerchantsService(prisma);
    await expect(svc.setStaffActive("x", true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("setStaffActive atualiza o flag", async () => {
    const update = jest.fn().mockResolvedValue({ id: "ss1", active: false });
    const prisma = makePrisma({
      storeStaff: { findUnique: jest.fn().mockResolvedValue({ id: "ss1" }), update },
    });
    const svc = new AdminMerchantsService(prisma);
    await svc.setStaffActive("ss1", false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } }),
    );
  });
});
