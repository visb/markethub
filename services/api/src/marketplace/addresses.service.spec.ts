import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { GeocodingProvider } from "../geocoding";
import { AddressesService } from "./addresses.service";

/**
 * Story 24: endereços de entrega. Sem DB — Prisma e o GeocodingProvider (story 28)
 * mockados. Cobre CRUD, default exclusivo, cobertura de cidade (S6.3),
 * resolução de coordenadas (informadas vs geocode) e ownership.
 */
const covered = { city: "Curitiba", state: "PR" } as const;

function baseInput(over: Partial<Record<string, unknown>> = {}) {
  return {
    label: "Casa",
    street: "Rua A",
    number: "100",
    city: covered.city,
    state: covered.state,
    zipCode: "80000-000",
    ...over,
  } as never;
}

function makeService(opts: { owned?: Record<string, unknown> | null } = {}) {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "a1", ...data }));
  const update = jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const del = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(
    opts.owned === undefined
      ? { id: "a1", userId: "u1", street: "Rua A", number: "100", city: "Curitiba", state: "PR", zipCode: "80000-000", latitude: -25, longitude: -49 }
      : opts.owned,
  );

  const prisma = {
    address: { findMany, count, create, update, updateMany, delete: del, findUnique },
  } as never;

  const geocode = jest.fn().mockResolvedValue({ latitude: -25.43, longitude: -49.27 });
  const geocoding = { geocode } as unknown as GeocodingProvider;

  const svc = new AddressesService(prisma, geocoding);
  return { svc, findMany, count, create, update, updateMany, del, findUnique, geocode };
}

describe("AddressesService (story 24)", () => {
  describe("list", () => {
    it("ordena default primeiro, depois mais recente", async () => {
      const { svc, findMany } = makeService();
      await svc.list("u1");
      expect(findMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    });
  });

  describe("create", () => {
    it("primeiro endereço vira default e limpa defaults antigos; geocodifica", async () => {
      const { svc, count, create, updateMany, geocode } = makeService();
      count.mockResolvedValueOnce(0);
      const res = await svc.create("u1", baseInput());
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", isDefault: true } }),
      );
      expect(geocode).toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "u1", isDefault: true, latitude: -25.43, longitude: -49.27 }),
        }),
      );
      expect(res).toMatchObject({ id: "a1", isDefault: true });
    });

    it("coordenadas informadas pelo cliente → não geocodifica", async () => {
      const { svc, count, geocode, create } = makeService();
      count.mockResolvedValueOnce(2);
      await svc.create("u1", baseInput({ latitude: -10, longitude: -20, isDefault: false }));
      expect(geocode).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ latitude: -10, longitude: -20 }) }),
      );
    });

    it("não-default quando já há endereços e isDefault ausente → não limpa default", async () => {
      const { svc, count, updateMany, create } = makeService();
      count.mockResolvedValueOnce(3);
      await svc.create("u1", baseInput());
      expect(updateMany).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) }),
      );
    });

    it("cidade fora de cobertura → CITY_NOT_COVERED (não cria)", async () => {
      const { svc, create } = makeService();
      await expect(
        svc.create("u1", baseInput({ city: "São Paulo", state: "SP" })),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "CITY_NOT_COVERED" }) });
      expect(create).not.toHaveBeenCalled();
    });

    it("geocode sem hit → coordenadas null", async () => {
      const { svc, count, geocode, create } = makeService();
      count.mockResolvedValueOnce(0);
      geocode.mockResolvedValueOnce(null);
      await svc.create("u1", baseInput());
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ latitude: null, longitude: null }) }),
      );
    });
  });

  describe("update", () => {
    it("endereço de outro usuário → ADDRESS_NOT_FOUND", async () => {
      const { svc, update } = makeService({ owned: { id: "a1", userId: "outro" } });
      await expect(svc.update("u1", "a1", { label: "X" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ADDRESS_NOT_FOUND" }),
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("inexistente → ADDRESS_NOT_FOUND", async () => {
      const { svc } = makeService({ owned: null });
      await expect(svc.update("u1", "a1", { label: "X" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("mudar cidade para fora de cobertura → CITY_NOT_COVERED", async () => {
      const { svc } = makeService();
      await expect(svc.update("u1", "a1", { city: "São Paulo", state: "SP" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "CITY_NOT_COVERED" }),
      });
    });

    it("marcar isDefault → limpa defaults antigos", async () => {
      const { svc, updateMany } = makeService();
      await svc.update("u1", "a1", { isDefault: true });
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", isDefault: true } }),
      );
    });

    it("endereço mudou sem lat nova (e sem coordenada atual) → re-geocodifica", async () => {
      const { svc, geocode, update } = makeService({
        owned: { id: "a1", userId: "u1", street: "Rua A", number: "100", city: "Curitiba", state: "PR", zipCode: "80000-000", latitude: null, longitude: null },
      });
      await svc.update("u1", "a1", { street: "Rua Nova" });
      expect(geocode).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ street: "Rua Nova", latitude: -25.43 }) }),
      );
    });

    it("editar só o CEP (sem lat nova, sem coord atual) → re-geocodifica (story 75)", async () => {
      const { svc, geocode, update } = makeService({
        owned: { id: "a1", userId: "u1", street: "Rua A", number: "100", city: "Curitiba", state: "PR", zipCode: "80000-000", latitude: null, longitude: null },
      });
      await svc.update("u1", "a1", { zipCode: "81000-000" });
      expect(geocode).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ zipCode: "81000-000", latitude: -25.43 }) }),
      );
    });

    it("editar só o bairro (sem lat nova, sem coord atual) → re-geocodifica (story 75)", async () => {
      const { svc, geocode } = makeService({
        owned: { id: "a1", userId: "u1", street: "Rua A", number: "100", city: "Curitiba", state: "PR", zipCode: "80000-000", latitude: null, longitude: null },
      });
      await svc.update("u1", "a1", { district: "Batel" });
      expect(geocode).toHaveBeenCalled();
    });

    it("lat informada → não re-geocodifica", async () => {
      const { svc, geocode, update } = makeService();
      await svc.update("u1", "a1", { street: "Rua Nova", latitude: -1, longitude: -2 });
      expect(geocode).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ latitude: -1, longitude: -2 }) }),
      );
    });

    it("só campo não-geográfico (label) → não geocodifica", async () => {
      const { svc, geocode } = makeService();
      await svc.update("u1", "a1", { label: "Trabalho" });
      expect(geocode).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("dono → deleta e retorna { id, deleted }", async () => {
      const { svc, del } = makeService();
      const res = await svc.remove("u1", "a1");
      expect(del).toHaveBeenCalledWith({ where: { id: "a1" } });
      expect(res).toEqual({ id: "a1", deleted: true });
    });

    it("não-dono → ADDRESS_NOT_FOUND (não deleta)", async () => {
      const { svc, del } = makeService({ owned: null });
      await expect(svc.remove("u1", "a1")).rejects.toBeInstanceOf(NotFoundException);
      expect(del).not.toHaveBeenCalled();
    });
  });

  describe("setDefault", () => {
    it("limpa defaults e marca o escolhido", async () => {
      const { svc, updateMany, update } = makeService();
      await svc.setDefault("u1", "a1");
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u1", isDefault: true } }),
      );
      expect(update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { isDefault: true } });
    });

    it("não-dono → ADDRESS_NOT_FOUND", async () => {
      const { svc } = makeService({ owned: null });
      await expect(svc.setDefault("u1", "a1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it("CITY_NOT_COVERED é BadRequestException", async () => {
    const { svc } = makeService();
    await expect(
      svc.create("u1", baseInput({ city: "Rio de Janeiro", state: "RJ" })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
