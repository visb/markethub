import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MerchantVehiclesService } from "./merchant-vehicles.service";

/**
 * Story 14: frota de veículos da rede (merchant). O veículo pertence à rede; a
 * `merchantId` é resolvida pelo contexto do usuário (posse via StoreStaff manager),
 * nunca pelo body. Escopo e validação de placa reforçados no service.
 */
function makeService(opts: {
  myStores?: { id: string; name: string; merchantId: string }[];
  vehicleRow?: {
    id: string;
    merchantId: string;
    plate: string;
    type: string;
    description: string | null;
    active: boolean;
    createdAt: Date;
  } | null;
  deliveriesUsing?: number;
}) {
  const myStores = opts.myStores ?? [];
  const merchant = { myStores: jest.fn().mockResolvedValue(myStores) } as never;

  const vehicleCreate = jest
    .fn()
    .mockImplementation(({ data }) =>
      Promise.resolve({
        id: "v1",
        description: null,
        active: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...data,
      }),
    );
  const vehicleFindMany = jest.fn().mockResolvedValue([]);
  const vehicleFindUnique = jest.fn().mockResolvedValue(opts.vehicleRow ?? null);
  const vehicleUpdate = jest
    .fn()
    .mockImplementation(({ data }) =>
      Promise.resolve({
        id: "v1",
        merchantId: "mer1",
        plate: "ABC1D23",
        type: "car",
        description: null,
        active: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...data,
      }),
    );
  const vehicleDelete = jest.fn().mockResolvedValue({});
  const deliveryCount = jest.fn().mockResolvedValue(opts.deliveriesUsing ?? 0);

  const prisma = {
    vehicle: {
      create: vehicleCreate,
      findMany: vehicleFindMany,
      findUnique: vehicleFindUnique,
      update: vehicleUpdate,
      delete: vehicleDelete,
    },
    delivery: { count: deliveryCount },
  } as never;

  const svc = new MerchantVehiclesService(prisma, merchant);
  return {
    svc,
    vehicleCreate,
    vehicleFindMany,
    vehicleUpdate,
    vehicleDelete,
    deliveryCount,
  };
}

const owner = { id: "o1", roles: ["merchant"] };
const manager = { id: "m1", roles: ["customer"] };
const storeA = { id: "sA", name: "Loja A", merchantId: "mer1" };
const storeOther = { id: "sB", name: "Loja B", merchantId: "mer2" };

describe("MerchantVehiclesService (story 14)", () => {
  describe("create", () => {
    it("resolve merchantId do contexto (rede única) e normaliza a placa", async () => {
      const { svc, vehicleCreate } = makeService({ myStores: [storeA] });
      await svc.create(owner, { plate: " abc1d23 ", type: "motorcycle" });
      expect(vehicleCreate).toHaveBeenCalledWith({
        data: { merchantId: "mer1", plate: "ABC1D23", type: "motorcycle", description: null, active: true },
      });
    });

    it("ignora merchantId do body fora do escopo → FORBIDDEN (MERCHANT_NOT_IN_SCOPE)", async () => {
      const { svc, vehicleCreate } = makeService({ myStores: [storeA] });
      await expect(
        svc.create(owner, { plate: "ABC1D23", type: "car", merchantId: "alheia" }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }) });
      expect(vehicleCreate).not.toHaveBeenCalled();
    });

    it("usuário sem rede → FORBIDDEN (NOT_A_MERCHANT_USER)", async () => {
      const { svc } = makeService({ myStores: [] });
      await expect(svc.create(manager, { plate: "ABC1D23", type: "car" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NOT_A_MERCHANT_USER" }),
      });
    });

    it("placa inválida → BadRequest (INVALID_PLATE)", async () => {
      const { svc, vehicleCreate } = makeService({ myStores: [storeA] });
      await expect(svc.create(owner, { plate: "XX1", type: "car" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "INVALID_PLATE" }),
      });
      expect(vehicleCreate).not.toHaveBeenCalled();
    });

    it("múltiplas redes sem merchantId → BadRequest (MERCHANT_AMBIGUOUS)", async () => {
      const { svc } = makeService({ myStores: [storeA, storeOther] });
      await expect(svc.create(owner, { plate: "ABC1D23", type: "car" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_AMBIGUOUS" }),
      });
    });

    it("múltiplas redes com merchantId do escopo → usa a rede informada", async () => {
      const { svc, vehicleCreate } = makeService({ myStores: [storeA, storeOther] });
      await svc.create(owner, { plate: "ABC1D23", type: "van", merchantId: "mer2" });
      expect(vehicleCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ merchantId: "mer2" }) }),
      );
    });
  });

  describe("list", () => {
    it("lista só as redes do escopo do usuário", async () => {
      const { svc, vehicleFindMany } = makeService({ myStores: [storeA] });
      await svc.list(owner);
      expect(vehicleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: { in: ["mer1"] } } }),
      );
    });

    it("filtro por rede fora do escopo → FORBIDDEN", async () => {
      const { svc } = makeService({ myStores: [storeA] });
      await expect(svc.list(owner, "mer2")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }),
      });
    });

    it("filtro por rede do escopo restringe o where àquela rede", async () => {
      const { svc, vehicleFindMany } = makeService({ myStores: [storeA, storeOther] });
      await svc.list(owner, "mer1");
      expect(vehicleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: { in: ["mer1"] } } }),
      );
    });

    it("usuário sem rede → lista vazia", async () => {
      const { svc, vehicleFindMany } = makeService({ myStores: [] });
      expect(await svc.list(manager)).toEqual([]);
      expect(vehicleFindMany).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    const row = {
      id: "v1",
      merchantId: "mer1",
      plate: "ABC1D23",
      type: "car",
      description: null,
      active: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    it("PATCH parcial altera só o enviado", async () => {
      const { svc, vehicleUpdate } = makeService({ myStores: [storeA], vehicleRow: row });
      await svc.update(owner, "v1", { description: "Fiorino branca" });
      expect(vehicleUpdate).toHaveBeenCalledWith({
        where: { id: "v1" },
        data: { description: "Fiorino branca" },
      });
    });

    it("soft toggle active", async () => {
      const { svc, vehicleUpdate } = makeService({ myStores: [storeA], vehicleRow: row });
      await svc.update(owner, "v1", { active: false });
      expect(vehicleUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { active: false } });
    });

    it("placa inválida no PATCH → BadRequest (INVALID_PLATE)", async () => {
      const { svc, vehicleUpdate } = makeService({ myStores: [storeA], vehicleRow: row });
      await expect(svc.update(owner, "v1", { plate: "??" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "INVALID_PLATE" }),
      });
      expect(vehicleUpdate).not.toHaveBeenCalled();
    });

    it("veículo fora do escopo → FORBIDDEN (MERCHANT_NOT_IN_SCOPE)", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        vehicleRow: { ...row, merchantId: "mer2" },
      });
      await expect(svc.update(owner, "v1", { active: false })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "MERCHANT_NOT_IN_SCOPE" }),
      });
    });

    it("veículo inexistente → NotFound (VEHICLE_NOT_FOUND)", async () => {
      const { svc } = makeService({ myStores: [storeA], vehicleRow: null });
      await expect(svc.update(owner, "nope", { active: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("nenhum campo → BadRequest (NO_FIELDS)", async () => {
      const { svc } = makeService({ myStores: [storeA], vehicleRow: row });
      await expect(svc.update(owner, "v1", {})).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NO_FIELDS" }),
      });
    });
  });

  describe("remove", () => {
    const row = {
      id: "v1",
      merchantId: "mer1",
      plate: "ABC1D23",
      type: "car",
      description: null,
      active: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    it("soft por padrão: desativa (active=false), não deleta", async () => {
      const { svc, vehicleUpdate, vehicleDelete } = makeService({
        myStores: [storeA],
        vehicleRow: row,
      });
      const res = await svc.remove(owner, "v1", false);
      expect(vehicleUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { active: false } });
      expect(vehicleDelete).not.toHaveBeenCalled();
      expect(res).toMatchObject({ id: "v1", active: false });
    });

    it("hard delete quando sem entregas associadas", async () => {
      const { svc, vehicleDelete } = makeService({
        myStores: [storeA],
        vehicleRow: row,
        deliveriesUsing: 0,
      });
      await svc.remove(owner, "v1", true);
      expect(vehicleDelete).toHaveBeenCalledWith({ where: { id: "v1" } });
    });

    it("hard delete bloqueado com entregas associadas → VEHICLE_IN_USE", async () => {
      const { svc, vehicleDelete } = makeService({
        myStores: [storeA],
        vehicleRow: row,
        deliveriesUsing: 2,
      });
      await expect(svc.remove(owner, "v1", true)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "VEHICLE_IN_USE" }),
      });
      expect(vehicleDelete).not.toHaveBeenCalled();
    });

    it("remover veículo inexistente → NotFound", async () => {
      const { svc } = makeService({ myStores: [storeA], vehicleRow: null });
      await expect(svc.remove(owner, "nope", true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("hard delete em uso lança BadRequestException", async () => {
      const { svc } = makeService({ myStores: [storeA], vehicleRow: row, deliveriesUsing: 1 });
      await expect(svc.remove(owner, "v1", true)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
