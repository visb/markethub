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
}) {
  const stores = opts.stores ?? [];
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new", ...data }));
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "s1", ...data }));
  const prisma = {
    storeStaff: {
      findMany: jest
        .fn()
        .mockResolvedValue(stores.map((s) => ({ store: s }))),
    },
    store: {
      findUnique: jest.fn().mockResolvedValue(opts.store ?? null),
      create,
      update,
    },
  } as never;
  const geocode = opts.geocode ?? jest.fn().mockResolvedValue({ latitude: -25.4, longitude: -49.2 });
  const geocoding = { geocode } as never;
  return { svc: new MerchantService(prisma, geocoding), create, update, geocode };
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
