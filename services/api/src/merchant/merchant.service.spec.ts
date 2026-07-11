import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { MerchantService } from "./merchant.service";

/**
 * Story 08: CRUD de lojas owner-only com geocodificação automática.
 * - owner (RoleName merchant) cria/edita; geocode chamado e lat/lng gravados.
 * - manager (sem RoleName merchant) recebe FORBIDDEN em create/update.
 * - update parcial só altera o enviado; mudança de endereço re-geocodifica.
 * - geocode falho → salva sem travar (lat/lng nulos) / override manual prevalece.
 */
function makeService(opts: {
  stores?: { id: string; name: string; merchantId: string }[];
  geocode?: jest.Mock;
  store?: Record<string, unknown> | null;
  /** simula vínculo StoreStaff(admin) ativo p/ resolveLevel (story 16). */
  hasAdminLink?: boolean;
}) {
  const stores = opts.stores ?? [];
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new", ...data }));
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "s1", ...data }));
  const prisma = {
    storeStaff: {
      findMany: jest
        .fn()
        .mockResolvedValue(stores.map((s) => ({ store: s }))),
      findFirst: jest.fn().mockResolvedValue(opts.hasAdminLink ? { id: "lnk" } : null),
    },
    store: {
      findUnique: jest.fn().mockResolvedValue(opts.store ?? null),
      findMany: jest.fn().mockResolvedValue(stores),
      create,
      update,
    },
  } as never;
  const geocode = opts.geocode ?? jest.fn().mockResolvedValue({ latitude: -25.4, longitude: -49.2 });
  const geocoding = { geocode } as never;
  const storeFindMany = (prisma as unknown as { store: { findMany: jest.Mock } }).store.findMany;
  return { svc: new MerchantService(prisma, geocoding), create, update, geocode, storeFindMany };
}

const owner = { id: "u1", roles: ["merchant"] };
const manager = { id: "u2", roles: ["customer"] };
const ownerStore = { id: "s1", name: "Loja 1", merchantId: "m1" };

describe("MerchantService — lojas (story 08)", () => {
  describe("createStore", () => {
    it("owner cria loja: geocode chamado, lat/lng gravados, merchantId resolvido", async () => {
      const { svc, create, geocode } = makeService({ stores: [ownerStore] });
      const res = await svc.createStore(owner, {
        name: "Nova",
        street: "Rua A",
        number: "10",
        city: "Curitiba",
        state: "PR",
      });
      expect(geocode).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      const data = create.mock.calls[0][0].data;
      expect(data.merchantId).toBe("m1");
      expect(data.latitude).toBe(-25.4);
      expect(data.longitude).toBe(-49.2);
      expect(res.name).toBe("Nova");
    });

    it("manager recebe FORBIDDEN (NOT_AN_OWNER) e não cria", async () => {
      const { svc, create } = makeService({ stores: [{ ...ownerStore }] });
      await expect(svc.createStore(manager, { name: "X" })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.createStore(manager, { name: "X" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NOT_AN_OWNER" }),
      });
      expect(create).not.toHaveBeenCalled();
    });

    it("admin (story 16) recebe FORBIDDEN (NOT_AN_OWNER): criar loja é owner-only", async () => {
      // admin tem RoleName merchant (guards) + vínculo admin → nível admin, não owner.
      const adminUser = { id: "u3", roles: ["merchant"] };
      const { svc, create } = makeService({ stores: [{ ...ownerStore }], hasAdminLink: true });
      await expect(svc.createStore(adminUser, { name: "X" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NOT_AN_OWNER" }),
      });
      expect(create).not.toHaveBeenCalled();
    });

    it("geocode falho → salva sem travar com lat/lng nulos", async () => {
      const { svc, create } = makeService({
        stores: [ownerStore],
        geocode: jest.fn().mockRejectedValue(new Error("offline")),
      });
      await svc.createStore(owner, { name: "N", street: "R", city: "C", state: "PR" });
      const data = create.mock.calls[0][0].data;
      expect(data.latitude).toBeNull();
      expect(data.longitude).toBeNull();
    });

    it("override manual de lat/lng prevalece sobre geocode", async () => {
      const { svc, create, geocode } = makeService({ stores: [ownerStore] });
      await svc.createStore(owner, {
        name: "N",
        street: "R",
        city: "C",
        state: "PR",
        latitude: 1,
        longitude: 2,
      });
      expect(geocode).not.toHaveBeenCalled();
      const data = create.mock.calls[0][0].data;
      expect(data.latitude).toBe(1);
      expect(data.longitude).toBe(2);
    });

    it("sem endereço completo não geocodifica (lat/lng nulos)", async () => {
      const { svc, create, geocode } = makeService({ stores: [ownerStore] });
      await svc.createStore(owner, { name: "N" });
      expect(geocode).not.toHaveBeenCalled();
      expect(create.mock.calls[0][0].data.latitude).toBeNull();
    });

    it("owner sem nenhuma rede ainda → BadRequest MERCHANT_NOT_RESOLVED", async () => {
      const { svc } = makeService({ stores: [] });
      await expect(svc.createStore(owner, { name: "N" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_NOT_RESOLVED" }),
      });
    });
  });

  describe("listStores (story 08/16)", () => {
    it("owner lista todas as lojas das suas redes (where por merchantId)", async () => {
      const { svc, storeFindMany } = makeService({ stores: [ownerStore] });
      await svc.listStores(owner);
      expect(storeFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: { in: ["m1"] } } }),
      );
    });

    it("admin/manager listam só as lojas do vínculo (where por id)", async () => {
      const { svc, storeFindMany } = makeService({ stores: [ownerStore], hasAdminLink: true });
      await svc.listStores({ id: "u3", roles: ["merchant"] });
      expect(storeFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["s1"] } } }),
      );
    });

    it("usuário sem loja → lista vazia (sem ir ao banco)", async () => {
      const { svc, storeFindMany } = makeService({ stores: [] });
      expect(await svc.listStores(manager)).toEqual([]);
      expect(storeFindMany).not.toHaveBeenCalled();
    });
  });

  describe("updateStore", () => {
    const existing = {
      id: "s1",
      merchantId: "m1",
      name: "Antiga",
      street: "R",
      number: "1",
      district: null,
      city: "Curitiba",
      state: "PR",
      zipCode: null,
      latitude: -25.0,
      longitude: -49.0,
    };

    it("update parcial só altera o enviado (não re-geocodifica se endereço não mudou)", async () => {
      const { svc, update, geocode } = makeService({ stores: [ownerStore], store: existing });
      await svc.updateStore(owner, "s1", { name: "Novo Nome" });
      expect(geocode).not.toHaveBeenCalled();
      const data = update.mock.calls[0][0].data;
      expect(data).toEqual({ name: "Novo Nome" });
    });

    it("mudança de endereço re-geocodifica e grava novas coords", async () => {
      const { svc, update, geocode } = makeService({ stores: [ownerStore], store: existing });
      await svc.updateStore(owner, "s1", { street: "Rua Nova" });
      expect(geocode).toHaveBeenCalledTimes(1);
      const data = update.mock.calls[0][0].data;
      expect(data.street).toBe("Rua Nova");
      expect(data.latitude).toBe(-25.4);
      expect(data.longitude).toBe(-49.2);
    });

    it("mudança de endereço com override manual de lat/lng não re-geocodifica", async () => {
      const { svc, update, geocode } = makeService({ stores: [ownerStore], store: existing });
      await svc.updateStore(owner, "s1", { street: "Rua Nova", latitude: 5, longitude: 6 });
      expect(geocode).not.toHaveBeenCalled();
      const data = update.mock.calls[0][0].data;
      expect(data.latitude).toBe(5);
      expect(data.longitude).toBe(6);
    });

    it("manager recebe FORBIDDEN em update", async () => {
      const { svc, update } = makeService({ stores: [ownerStore], store: existing });
      await expect(svc.updateStore(manager, "s1", { name: "X" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NOT_AN_OWNER" }),
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("loja inexistente → NotFound STORE_NOT_FOUND", async () => {
      const { svc } = makeService({ stores: [ownerStore], store: null });
      await expect(svc.updateStore(owner, "nope", { name: "X" })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("loja de outra rede → FORBIDDEN STORE_NOT_OWNED", async () => {
      const { svc } = makeService({
        stores: [ownerStore],
        store: { ...existing, merchantId: "outra" },
      });
      await expect(svc.updateStore(owner, "s1", { name: "X" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "STORE_NOT_OWNED" }),
      });
    });

    it("patch vazio → BadRequest NO_FIELDS", async () => {
      const { svc } = makeService({ stores: [ownerStore], store: existing });
      await expect(svc.updateStore(owner, "s1", {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it("toggle active (soft) altera só active", async () => {
      const { svc, update } = makeService({ stores: [ownerStore], store: existing });
      await svc.updateStore(owner, "s1", { active: false });
      expect(update.mock.calls[0][0].data).toEqual({ active: false });
    });
  });
});

// ── Story 43: contexto, pedidos, ofertas e estoque do manager ──

/**
 * Helper genérico para os fluxos de manager (offers/stocks/orders). `managed`
 * são os storeIds de StoreStaff(admin|manager) ativos do usuário.
 */
function makeManager(opts: {
  managed?: string[];
  hasAdminLink?: boolean;
  roles?: string[];
  offers?: unknown[];
  stocks?: unknown[];
  offer?: Record<string, unknown> | null;
  stock?: Record<string, unknown> | null;
  groups?: unknown[];
}) {
  const managed = opts.managed ?? ["s1"];
  const offerUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "o1", ...data }));
  const stockUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "k1", ...data }));
  const prisma = {
    storeStaff: {
      findMany: jest.fn().mockResolvedValue(
        managed.map((id) => ({ storeId: id, store: { id, name: `Loja ${id}`, merchantId: "m1" } })),
      ),
      findFirst: jest.fn().mockResolvedValue(opts.hasAdminLink ? { id: "lnk" } : null),
    },
    store: { findMany: jest.fn().mockResolvedValue(managed.map((id) => ({ id }))) },
    offer: {
      findMany: jest.fn().mockResolvedValue(opts.offers ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.offer ?? null),
      update: offerUpdate,
    },
    stock: {
      findMany: jest.fn().mockResolvedValue(opts.stocks ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.stock ?? null),
      update: stockUpdate,
    },
    orderGroup: { findMany: jest.fn().mockResolvedValue(opts.groups ?? []) },
  } as never;
  const geocoding = { geocode: jest.fn() } as never;
  return { svc: new MerchantService(prisma, geocoding), offerUpdate, stockUpdate, prisma };
}

const mgr = { id: "u2", roles: ["customer"] };

describe("MerchantService.getContext (story 16)", () => {
  it("owner sem loja ainda é permitido (merchantId null)", async () => {
    const { svc } = makeManager({ managed: [] });
    const ctx = await svc.getContext({ id: "u1", roles: ["merchant"] });
    expect(ctx).toEqual({ role: "owner", merchantId: null, stores: [] });
  });

  it("manager sem loja → FORBIDDEN NOT_A_MERCHANT_USER", async () => {
    const { svc } = makeManager({ managed: [] });
    await expect(svc.getContext(mgr)).rejects.toMatchObject({
      response: { code: "NOT_A_MERCHANT_USER" },
    });
  });

  it("vínculo admin → role admin + merchantId da primeira loja", async () => {
    const { svc } = makeManager({ managed: ["s1"], hasAdminLink: true });
    const ctx = await svc.getContext({ id: "u3", roles: ["merchant"] });
    expect(ctx.role).toBe("admin");
    expect(ctx.merchantId).toBe("m1");
  });
});

describe("MerchantService.scopedStores", () => {
  it("usuário sem loja → listas vazias", async () => {
    const { svc } = makeManager({ managed: [] });
    expect(await svc.scopedStores(mgr)).toEqual({ storeIds: [], merchantIds: [] });
  });

  it("owner expande toda a rede via store.findMany", async () => {
    const { svc, prisma } = makeManager({ managed: ["s1"] });
    (prisma as unknown as { store: { findMany: jest.Mock } }).store.findMany.mockResolvedValue([
      { id: "s1" },
      { id: "s2" },
    ]);
    const out = await svc.scopedStores({ id: "u1", roles: ["merchant"] });
    expect(out.storeIds).toEqual(["s1", "s2"]);
    expect(out.merchantIds).toEqual(["m1"]);
  });

  it("manager fica nas lojas do vínculo (não expande a rede)", async () => {
    const { svc } = makeManager({ managed: ["s1"], hasAdminLink: true });
    const out = await svc.scopedStores({ id: "u3", roles: ["merchant"] });
    expect(out.storeIds).toEqual(["s1"]);
  });
});

describe("MerchantService.listOrders (story 12)", () => {
  it("usuário sem loja no escopo → FORBIDDEN", async () => {
    const { svc } = makeManager({ managed: [] });
    await expect(svc.listOrders(mgr)).rejects.toMatchObject({
      response: { code: "NOT_A_MERCHANT_USER" },
    });
  });

  it("loja fora do escopo → STORE_NOT_IN_SCOPE", async () => {
    const { svc } = makeManager({ managed: ["s1"], hasAdminLink: true });
    await expect(svc.listOrders({ id: "u3", roles: ["merchant"] }, { storeId: "outra" })).rejects.toMatchObject({
      response: { code: "STORE_NOT_IN_SCOPE" },
    });
  });

  it("mapeia o card resumido com totalCents somado", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      hasAdminLink: true,
      groups: [
        {
          id: "g1",
          orderId: "ord1",
          storeId: "s1",
          status: "placed",
          fulfillment: "delivery",
          subtotalCents: 1000,
          deliveryCents: 500,
          prepCents: 200,
          platformFeeCents: 100,
          pickupCode: null,
          store: { name: "Loja s1" },
          order: { createdAt: new Date("2026-01-02T10:00:00Z") },
          _count: { items: 3 },
        },
      ],
    });
    const out = await svc.listOrders({ id: "u3", roles: ["merchant"] });
    expect(out[0]).toMatchObject({
      id: "g1",
      storeName: "Loja s1",
      itemCount: 3,
      totalCents: 1800,
    });
    expect(out[0].createdAt).toBe("2026-01-02T10:00:00.000Z");
  });
});

describe("MerchantService.listOffers", () => {
  it("manager sem loja → FORBIDDEN NOT_A_MANAGER", async () => {
    const { svc } = makeManager({ managed: [] });
    await expect(svc.listOffers("u2", {})).rejects.toMatchObject({
      response: { code: "NOT_A_MANAGER" },
    });
  });

  it("loja não gerida → STORE_NOT_MANAGED", async () => {
    const { svc } = makeManager({ managed: ["s1"] });
    await expect(svc.listOffers("u2", { storeId: "outra" })).rejects.toMatchObject({
      response: { code: "STORE_NOT_MANAGED" },
    });
  });

  it("anexa estoque por store+product", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      offers: [
        {
          id: "o1",
          storeId: "s1",
          productId: "p1",
          priceCents: 199,
          promoPriceCents: null,
          available: true,
          lockedFields: [],
          product: { id: "p1", name: "Leite" },
          store: { id: "s1", name: "Loja s1" },
        },
      ],
      stocks: [{ storeId: "s1", productId: "p1", quantity: 4, available: true, lockedFields: [] }],
    });
    const out = await svc.listOffers("u2", { categoryId: "c1", search: "leite", available: true });
    expect(out[0].storeName).toBe("Loja s1");
    expect(out[0].stock).toMatchObject({ quantity: 4 });
  });
});

describe("MerchantService.updateOffer / unlockOffer", () => {
  it("404 se a oferta não existe", async () => {
    const { svc } = makeManager({ managed: ["s1"], offer: null });
    await expect(svc.updateOffer("u2", "x", { available: true })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("preço negativo → INVALID_PRICE", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      offer: { id: "o1", storeId: "s1", lockedFields: [] },
    });
    await expect(svc.updateOffer("u2", "o1", { priceCents: -1 })).rejects.toMatchObject({
      response: { code: "INVALID_PRICE" },
    });
  });

  it("patch vazio → NO_FIELDS", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      offer: { id: "o1", storeId: "s1", lockedFields: [] },
    });
    await expect(svc.updateOffer("u2", "o1", {})).rejects.toMatchObject({
      response: { code: "NO_FIELDS" },
    });
  });

  it("trava priceCents/promoPriceCents/available e seta updatedById", async () => {
    const { svc, offerUpdate } = makeManager({
      managed: ["s1"],
      offer: { id: "o1", storeId: "s1", lockedFields: [] },
    });
    await svc.updateOffer("u2", "o1", { priceCents: 199, promoPriceCents: 150, available: true });
    const data = offerUpdate.mock.calls[0][0].data;
    expect(data.lockedFields).toEqual(expect.arrayContaining(["priceCents", "promoPriceCents", "available"]));
    expect(data.updatedById).toBe("u2");
  });

  it("oferta de loja não gerida → STORE_NOT_MANAGED", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      offer: { id: "o1", storeId: "outra", lockedFields: [] },
    });
    await expect(svc.updateOffer("u2", "o1", { available: true })).rejects.toMatchObject({
      response: { code: "STORE_NOT_MANAGED" },
    });
  });

  it("unlockOffer remove o campo travado", async () => {
    const { svc, offerUpdate } = makeManager({
      managed: ["s1"],
      offer: { id: "o1", storeId: "s1", lockedFields: ["priceCents", "available"] },
    });
    await svc.unlockOffer("u2", "o1", "priceCents");
    expect(offerUpdate.mock.calls[0][0].data.lockedFields).toEqual(["available"]);
  });

  it("unlockOffer campo inválido → INVALID_FIELD", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      offer: { id: "o1", storeId: "s1", lockedFields: [] },
    });
    await expect(svc.unlockOffer("u2", "o1", "weird")).rejects.toMatchObject({
      response: { code: "INVALID_FIELD" },
    });
  });
});

describe("MerchantService.listStocks / updateStock / unlockStock", () => {
  it("listStocks mapeia o estoque do manager", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      stocks: [
        {
          id: "k1",
          storeId: "s1",
          productId: "p1",
          quantity: 7,
          available: true,
          lockedFields: [],
          product: { id: "p1", name: "Leite" },
          store: { id: "s1", name: "Loja s1" },
        },
      ],
    });
    const out = await svc.listStocks("u2");
    expect(out[0]).toMatchObject({ id: "k1", storeName: "Loja s1", quantity: 7 });
  });

  it("updateStock 404 se não existe", async () => {
    const { svc } = makeManager({ managed: ["s1"], stock: null });
    await expect(svc.updateStock("u2", "x", { quantity: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updateStock quantity negativa → INVALID_QUANTITY", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      stock: { id: "k1", storeId: "s1", lockedFields: [] },
    });
    await expect(svc.updateStock("u2", "k1", { quantity: -3 })).rejects.toMatchObject({
      response: { code: "INVALID_QUANTITY" },
    });
  });

  it("updateStock patch vazio → NO_FIELDS", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      stock: { id: "k1", storeId: "s1", lockedFields: [] },
    });
    await expect(svc.updateStock("u2", "k1", {})).rejects.toMatchObject({
      response: { code: "NO_FIELDS" },
    });
  });

  it("updateStock quantity null aceito + trava campos", async () => {
    const { svc, stockUpdate } = makeManager({
      managed: ["s1"],
      stock: { id: "k1", storeId: "s1", lockedFields: [] },
    });
    await svc.updateStock("u2", "k1", { quantity: null, available: false });
    const data = stockUpdate.mock.calls[0][0].data;
    expect(data.quantity).toBeNull();
    expect(data.lockedFields).toEqual(expect.arrayContaining(["quantity", "available"]));
    expect(data.updatedById).toBe("u2");
  });

  it("unlockStock remove campo travado", async () => {
    const { svc, stockUpdate } = makeManager({
      managed: ["s1"],
      stock: { id: "k1", storeId: "s1", lockedFields: ["quantity", "available"] },
    });
    await svc.unlockStock("u2", "k1", "quantity");
    expect(stockUpdate.mock.calls[0][0].data.lockedFields).toEqual(["available"]);
  });

  it("unlockStock campo inválido → INVALID_FIELD", async () => {
    const { svc } = makeManager({
      managed: ["s1"],
      stock: { id: "k1", storeId: "s1", lockedFields: [] },
    });
    await expect(svc.unlockStock("u2", "k1", "weird")).rejects.toMatchObject({
      response: { code: "INVALID_FIELD" },
    });
  });
});

// ── Story 52: horário de funcionamento + fechamentos (owner-only) ──

function makeHours(opts: {
  owner?: boolean;
  store?: Record<string, unknown> | null;
  hoursRows?: unknown[];
  closureRows?: { id: string; date: Date; reason: string | null }[];
  existingClosure?: unknown;
  closure?: { id: string; storeId: string } | null;
}) {
  const isOwner = opts.owner ?? true;
  const stores = [{ id: "s1", name: "Loja 1", merchantId: "m1" }];
  const hoursFindMany = jest.fn().mockResolvedValue(opts.hoursRows ?? []);
  const closureCreate = jest
    .fn()
    .mockImplementation(({ data, select }) =>
      Promise.resolve({ id: "cl-new", date: data.date, reason: data.reason, ...(select ? {} : {}) }),
    );
  const closureDelete = jest.fn().mockResolvedValue({});
  const prisma = {
    storeStaff: {
      findMany: jest.fn().mockResolvedValue(stores.map((s) => ({ store: s }))),
      // owner → sem vínculo admin; caso contrário simula admin (não-owner)
      findFirst: jest.fn().mockResolvedValue(isOwner ? null : { id: "lnk" }),
    },
    store: {
      findUnique: jest.fn().mockResolvedValue(
        "store" in opts ? opts.store : { id: "s1", merchantId: "m1" },
      ),
      findMany: jest.fn().mockResolvedValue(stores),
    },
    storeHours: {
      findMany: hoursFindMany,
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
    storeClosure: {
      findMany: jest.fn().mockResolvedValue(opts.closureRows ?? []),
      findUnique: jest
        .fn()
        .mockResolvedValueOnce("existingClosure" in opts ? opts.existingClosure : ("closure" in opts ? opts.closure : null)),
      create: closureCreate,
      delete: closureDelete,
    },
    $transaction: jest.fn().mockResolvedValue([]),
  } as never;
  // roles do owner: inclui merchant p/ resolveLevel = owner
  const geocoding = { geocode: jest.fn() } as never;
  return { svc: new MerchantService(prisma, geocoding), prisma, closureCreate, closureDelete };
}

const hoursOwner = { id: "u1", roles: ["merchant"] };
const hoursManager = { id: "u2", roles: ["customer"] };

describe("MerchantService — horário de funcionamento (story 52)", () => {
  it("owner lê o horário semanal ordenado", async () => {
    const rows = [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }];
    const { svc } = makeHours({ hoursRows: rows });
    const out = await svc.storeHours(hoursOwner, "s1");
    expect(out).toEqual(rows);
  });

  it("manager (não-owner) → FORBIDDEN NOT_AN_OWNER", async () => {
    const { svc } = makeHours({ owner: false });
    await expect(svc.storeHours(hoursManager, "s1")).rejects.toMatchObject({
      response: { code: "NOT_AN_OWNER" },
    });
  });

  it("loja inexistente → STORE_NOT_FOUND", async () => {
    const { svc } = makeHours({ store: null });
    await expect(svc.storeHours(hoursOwner, "s1")).rejects.toMatchObject({
      response: { code: "STORE_NOT_FOUND" },
    });
  });

  it("setStoreHours grava faixas válidas (replace-all)", async () => {
    const { svc, prisma } = makeHours({});
    await svc.setStoreHours(hoursOwner, "s1", [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }]);
    expect((prisma as never as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
  });

  it("setStoreHours: closesAt <= opensAt → INVALID_HOURS", async () => {
    const { svc } = makeHours({});
    await expect(
      svc.setStoreHours(hoursOwner, "s1", [{ dayOfWeek: 1, opensAt: 600, closesAt: 600 }]),
    ).rejects.toMatchObject({ response: { code: "INVALID_HOURS" } });
  });

  it("setStoreHours: dia fora de 0–6 → INVALID_DAY", async () => {
    const { svc } = makeHours({});
    await expect(
      svc.setStoreHours(hoursOwner, "s1", [{ dayOfWeek: 7, opensAt: 480, closesAt: 1320 }]),
    ).rejects.toMatchObject({ response: { code: "INVALID_DAY" } });
  });

  it("setStoreHours: dia duplicado → DUPLICATE_DAY", async () => {
    const { svc } = makeHours({});
    await expect(
      svc.setStoreHours(hoursOwner, "s1", [
        { dayOfWeek: 1, opensAt: 480, closesAt: 1320 },
        { dayOfWeek: 1, opensAt: 500, closesAt: 1000 },
      ]),
    ).rejects.toMatchObject({ response: { code: "DUPLICATE_DAY" } });
  });
});

describe("MerchantService — fechamentos excepcionais (story 52)", () => {
  it("lista fechamentos com data normalizada YYYY-MM-DD", async () => {
    const { svc } = makeHours({
      closureRows: [{ id: "c1", date: new Date("2026-12-25T00:00:00Z"), reason: "Natal" }],
    });
    const out = await svc.storeClosures(hoursOwner, "s1");
    expect(out).toEqual([{ id: "c1", date: "2026-12-25", reason: "Natal" }]);
  });

  it("adiciona fechamento novo (data + motivo)", async () => {
    const { svc, closureCreate } = makeHours({ existingClosure: null });
    const out = await svc.addStoreClosure(hoursOwner, "s1", { date: "2026-12-25", reason: "Natal" });
    expect(closureCreate).toHaveBeenCalledTimes(1);
    expect(out.date).toBe("2026-12-25");
    expect(out.reason).toBe("Natal");
  });

  it("data inválida → INVALID_DATE", async () => {
    const { svc } = makeHours({ existingClosure: null });
    await expect(
      svc.addStoreClosure(hoursOwner, "s1", { date: "25/12/2026" }),
    ).rejects.toMatchObject({ response: { code: "INVALID_DATE" } });
  });

  it("data duplicada → CLOSURE_EXISTS", async () => {
    const { svc } = makeHours({ existingClosure: { id: "c1" } });
    await expect(
      svc.addStoreClosure(hoursOwner, "s1", { date: "2026-12-25" }),
    ).rejects.toMatchObject({ response: { code: "CLOSURE_EXISTS" } });
  });

  it("remove fechamento da loja", async () => {
    const { svc, closureDelete } = makeHours({ closure: { id: "c1", storeId: "s1" } });
    const out = await svc.removeStoreClosure(hoursOwner, "s1", "c1");
    expect(closureDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(out).toEqual({ removed: true });
  });

  it("fechamento de outra loja → CLOSURE_NOT_FOUND", async () => {
    const { svc } = makeHours({ closure: { id: "c1", storeId: "outra" } });
    await expect(svc.removeStoreClosure(hoursOwner, "s1", "c1")).rejects.toMatchObject({
      response: { code: "CLOSURE_NOT_FOUND" },
    });
  });
});
