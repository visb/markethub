import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MerchantStaffService } from "./merchant-staff.service";

/**
 * Story 10: gestão de colaboradores (StoreStaff) pelo app merchant.
 * - owner (RoleName merchant): todas as lojas das suas redes; cria/edita/remove
 *   qualquer papel; pode deletar o vínculo de fato.
 * - manager (StoreStaff manager): só as lojas dele; gere picker/driver, mas NÃO
 *   manager; remoção = desativa (não deleta).
 */
function makeService(opts: {
  myStores?: { id: string; name: string; merchantId: string }[];
  storesInMerchant?: { id: string }[];
  staffRow?: { id: string; staffRole: string; active: boolean; storeId: string } | null;
}) {
  const myStores = opts.myStores ?? [];
  const merchant = {
    myStores: jest.fn().mockResolvedValue(myStores),
  } as never;

  const storeFindMany = jest.fn().mockResolvedValue(opts.storesInMerchant ?? []);
  const staffFindMany = jest.fn().mockResolvedValue([]);
  const staffFindUnique = jest.fn().mockResolvedValue(opts.staffRow ?? null);
  const staffUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "st1", ...data }));
  const staffDelete = jest.fn().mockResolvedValue({});
  const prisma = {
    store: { findMany: storeFindMany },
    storeStaff: {
      findMany: staffFindMany,
      findUnique: staffFindUnique,
      update: staffUpdate,
      delete: staffDelete,
    },
  } as never;

  const createStaff = jest.fn().mockResolvedValue({ id: "u9", email: "x@y.z", name: "X" });
  const adminUsers = { createStaff } as never;

  const svc = new MerchantStaffService(prisma, merchant, adminUsers);
  return { svc, createStaff, staffFindMany, staffUpdate, staffDelete, storeFindMany };
}

const owner = { id: "o1", roles: ["merchant"] };
const manager = { id: "m1", roles: ["customer"] };
const storeA = { id: "sA", name: "Loja A", merchantId: "mer1" };
const storeB = { id: "sB", name: "Loja B", merchantId: "mer1" };

describe("MerchantStaffService (story 10)", () => {
  describe("create", () => {
    it("owner cria manager/picker/driver em loja da rede → delega createStaff", async () => {
      const { svc, createStaff } = makeService({
        myStores: [storeA],
        storesInMerchant: [{ id: "sA" }, { id: "sB" }],
      });
      for (const role of ["manager", "picker", "driver"] as const) {
        await svc.create(owner, {
          name: "N",
          email: `${role}@x.z`,
          password: "secret1",
          staffRole: role,
          storeId: "sB",
        });
      }
      expect(createStaff).toHaveBeenCalledTimes(3);
      expect(createStaff).toHaveBeenCalledWith(
        expect.objectContaining({ staffRole: "manager", storeId: "sB" }),
      );
    });

    it("gerente cria picker/driver só nas suas lojas", async () => {
      const { svc, createStaff } = makeService({ myStores: [storeA] });
      await svc.create(manager, {
        name: "P",
        email: "p@x.z",
        password: "secret1",
        staffRole: "picker",
        storeId: "sA",
      });
      expect(createStaff).toHaveBeenCalledTimes(1);
    });

    it("gerente criar manager → FORBIDDEN (CANNOT_MANAGE_MANAGER)", async () => {
      const { svc, createStaff } = makeService({ myStores: [storeA] });
      await expect(
        svc.create(manager, {
          name: "M",
          email: "m@x.z",
          password: "secret1",
          staffRole: "manager",
          storeId: "sA",
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "CANNOT_MANAGE_MANAGER" }) });
      expect(createStaff).not.toHaveBeenCalled();
    });

    it("criar em loja fora do escopo → FORBIDDEN (STORE_NOT_IN_SCOPE)", async () => {
      const { svc, createStaff } = makeService({ myStores: [storeA] });
      await expect(
        svc.create(manager, {
          name: "P",
          email: "p@x.z",
          password: "secret1",
          staffRole: "picker",
          storeId: "outra",
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "STORE_NOT_IN_SCOPE" }) });
      expect(createStaff).not.toHaveBeenCalled();
    });

    it("usuário sem nenhuma loja → FORBIDDEN (NOT_A_MERCHANT_USER)", async () => {
      const { svc } = makeService({ myStores: [] });
      await expect(
        svc.create(manager, {
          name: "P",
          email: "p@x.z",
          password: "secret1",
          staffRole: "picker",
          storeId: "sA",
        }),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: "NOT_A_MERCHANT_USER" }) });
    });
  });

  describe("list", () => {
    it("owner expande para todas as lojas da rede (store.findMany por merchantId)", async () => {
      const { svc, staffFindMany, storeFindMany } = makeService({
        myStores: [storeA, storeB],
        storesInMerchant: [{ id: "sA" }, { id: "sB" }],
      });
      await svc.list(owner);
      expect(storeFindMany).toHaveBeenCalledWith({
        where: { merchantId: { in: ["mer1"] } },
        select: { id: true },
      });
      expect(staffFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId: { in: ["sA", "sB"] } } }),
      );
    });

    it("manager lista só as lojas do vínculo", async () => {
      const { svc, staffFindMany } = makeService({ myStores: [storeA] });
      await svc.list(manager);
      expect(staffFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId: { in: ["sA"] } } }),
      );
    });

    it("filtro por loja fora do escopo → FORBIDDEN", async () => {
      const { svc } = makeService({ myStores: [storeA] });
      await expect(svc.list(manager, "alheia")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "STORE_NOT_IN_SCOPE" }),
      });
    });
  });

  describe("update", () => {
    it("owner troca papel/ativa", async () => {
      const { svc, staffUpdate } = makeService({
        myStores: [storeA],
        storesInMerchant: [{ id: "sA" }],
        staffRow: { id: "st1", staffRole: "picker", active: true, storeId: "sA" },
      });
      await svc.update(owner, "st1", { active: false });
      expect(staffUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "st1" }, data: { active: false } }),
      );
    });

    it("gerente não atualiza vínculo de manager → FORBIDDEN", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        staffRow: { id: "st1", staffRole: "manager", active: true, storeId: "sA" },
      });
      await expect(svc.update(manager, "st1", { active: false })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "CANNOT_MANAGE_MANAGER" }),
      });
    });

    it("gerente não promove a manager → FORBIDDEN", async () => {
      const { svc } = makeService({
        myStores: [storeA],
        staffRow: { id: "st1", staffRole: "picker", active: true, storeId: "sA" },
      });
      await expect(svc.update(manager, "st1", { staffRole: "manager" })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "CANNOT_MANAGE_MANAGER" }),
      });
    });

    it("vínculo inexistente → NotFound", async () => {
      const { svc } = makeService({ myStores: [storeA], staffRow: null });
      await expect(svc.update(owner, "nope", { active: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("remove", () => {
    it("soft por padrão: desativa (active=false), não deleta", async () => {
      const { svc, staffUpdate, staffDelete } = makeService({
        myStores: [storeA],
        staffRow: { id: "st1", staffRole: "picker", active: true, storeId: "sA" },
      });
      const res = await svc.remove(manager, "st1", false);
      expect(staffUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      expect(staffDelete).not.toHaveBeenCalled();
      expect(res).toMatchObject({ id: "st1" });
    });

    it("hard delete só para owner", async () => {
      const { svc, staffDelete } = makeService({
        myStores: [storeA],
        storesInMerchant: [{ id: "sA" }],
        staffRow: { id: "st1", staffRole: "picker", active: true, storeId: "sA" },
      });
      await svc.remove(owner, "st1", true);
      expect(staffDelete).toHaveBeenCalledWith({ where: { id: "st1" } });
    });

    it("manager pedindo hard delete → FORBIDDEN (DELETE_OWNER_ONLY)", async () => {
      const { svc, staffDelete } = makeService({
        myStores: [storeA],
        staffRow: { id: "st1", staffRole: "picker", active: true, storeId: "sA" },
      });
      await expect(svc.remove(manager, "st1", true)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "DELETE_OWNER_ONLY" }),
      });
      expect(staffDelete).not.toHaveBeenCalled();
    });
  });
});
