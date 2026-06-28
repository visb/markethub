import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AdminUsersService } from "./admin-users.service";

/**
 * Story 24: cobertura de gestão de usuários admin. Sem DB — Prisma mockado.
 * Cobre list (paginação/clamp/filtros/map), detail, setActive, createStaff
 * (mapeamento StaffRole→RoleName das stories 16-18 + conflitos) e listStores.
 */
function makeService() {
  const userFindMany = jest.fn().mockResolvedValue([]);
  const userCount = jest.fn().mockResolvedValue(0);
  const userFindUnique = jest.fn().mockResolvedValue(null);
  const userCreate = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ id: "u1", email: data.email, name: data.name }));
  const userUpdate = jest
    .fn()
    .mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
  const storeFindUnique = jest.fn().mockResolvedValue({ id: "s1", name: "Loja" });
  const storeFindMany = jest.fn().mockResolvedValue([]);

  const prisma = {
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    user: {
      findMany: userFindMany,
      count: userCount,
      findUnique: userFindUnique,
      create: userCreate,
      update: userUpdate,
    },
    store: { findUnique: storeFindUnique, findMany: storeFindMany },
  } as never;

  const svc = new AdminUsersService(prisma);
  return {
    svc,
    userFindMany,
    userCount,
    userFindUnique,
    userCreate,
    userUpdate,
    storeFindUnique,
    storeFindMany,
  };
}

describe("AdminUsersService (story 24)", () => {
  describe("list", () => {
    it("defaults: page 1, pageSize 20, sem filtros (where vazio)", async () => {
      const { svc, userFindMany, userCount } = makeService();
      userFindMany.mockResolvedValueOnce([]);
      userCount.mockResolvedValueOnce(0);
      const res = await svc.list({});
      expect(res).toMatchObject({ page: 1, pageSize: 20, total: 0, items: [] });
      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 0, take: 20, orderBy: { createdAt: "desc" } }),
      );
    });

    it("aplica filtro de papel e busca (OR name/email, trim)", async () => {
      const { svc, userFindMany } = makeService();
      await svc.list({ role: "picker", search: "  ana  ", page: 3, pageSize: 10 });
      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            roles: { some: { role: { name: "picker" } } },
            OR: [
              { name: { contains: "ana", mode: "insensitive" } },
              { email: { contains: "ana", mode: "insensitive" } },
            ],
          },
          skip: 20,
          take: 10,
        }),
      );
    });

    it("clampa page (mín 1) e pageSize (máx 100, mín 1)", async () => {
      const { svc, userFindMany } = makeService();
      await svc.list({ page: 0, pageSize: 999 });
      expect(userFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));

      await svc.list({ page: -5, pageSize: 0 });
      expect(userFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
    });

    it("mapeia roles e staff das linhas", async () => {
      const { svc, userFindMany, userCount } = makeService();
      userFindMany.mockResolvedValueOnce([
        {
          id: "u9",
          name: "Ana",
          email: "ana@x.z",
          active: true,
          createdAt: new Date("2024-01-01"),
          roles: [{ role: { name: "picker" } }, { role: { name: "merchant" } }],
          staffOf: [{ staffRole: "picker", store: { name: "Loja A", merchant: { name: "Rede X" } } }],
        },
      ]);
      userCount.mockResolvedValueOnce(1);
      const res = await svc.list({});
      expect(res.items[0]).toMatchObject({
        id: "u9",
        roles: ["picker", "merchant"],
        staff: [{ staffRole: "picker", store: "Loja A", merchant: "Rede X" }],
      });
      expect(res.total).toBe(1);
    });
  });

  describe("detail", () => {
    it("retorna usuário com roles achatados", async () => {
      const { svc, userFindUnique } = makeService();
      userFindUnique.mockResolvedValueOnce({
        id: "u1",
        name: "Ana",
        email: "ana@x.z",
        active: true,
        createdAt: new Date(),
        roles: [{ role: { name: "customer" } }],
        staffOf: [],
      });
      const res = await svc.detail("u1");
      expect(res.roles).toEqual(["customer"]);
    });

    it("inexistente → USER_NOT_FOUND", async () => {
      const { svc, userFindUnique } = makeService();
      userFindUnique.mockResolvedValueOnce(null);
      await expect(svc.detail("nope")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "USER_NOT_FOUND" }),
      });
    });
  });

  describe("setActive", () => {
    it("usuário existe → atualiza active", async () => {
      const { svc, userFindUnique, userUpdate } = makeService();
      userFindUnique.mockResolvedValueOnce({ id: "u1" });
      const res = await svc.setActive("u1", false);
      expect(userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "u1" }, data: { active: false } }),
      );
      expect(res).toMatchObject({ id: "u1", active: false });
    });

    it("inexistente → USER_NOT_FOUND (não chama update)", async () => {
      const { svc, userFindUnique, userUpdate } = makeService();
      userFindUnique.mockResolvedValueOnce(null);
      await expect(svc.setActive("nope", true)).rejects.toBeInstanceOf(NotFoundException);
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe("createStaff", () => {
    const base = {
      email: "novo@x.z",
      name: "Novo",
      password: "secret12",
      storeId: "s1",
    } as const;

    it("loja inexistente → STORE_NOT_FOUND", async () => {
      const { svc, storeFindUnique, userCreate } = makeService();
      storeFindUnique.mockResolvedValueOnce(null);
      await expect(svc.createStaff({ ...base, staffRole: "picker" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(userCreate).not.toHaveBeenCalled();
    });

    it("email já cadastrado → EMAIL_TAKEN", async () => {
      const { svc, storeFindUnique, userFindUnique, userCreate } = makeService();
      storeFindUnique.mockResolvedValueOnce({ id: "s1" });
      userFindUnique.mockResolvedValueOnce({ id: "u-existe" });
      await expect(svc.createStaff({ ...base, staffRole: "picker" })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(userCreate).not.toHaveBeenCalled();
    });

    it.each([
      ["admin", "merchant"],
      ["manager", "merchant"],
      ["picker", "picker"],
      ["driver", "driver"],
    ] as const)("staffRole %s → RoleName %s (vínculo de loja + hash)", async (staffRole, roleName) => {
      const { svc, storeFindUnique, userFindUnique, userCreate } = makeService();
      storeFindUnique.mockResolvedValueOnce({ id: "s1" });
      userFindUnique.mockResolvedValueOnce(null);
      const res = await svc.createStaff({ ...base, staffRole });
      expect(res).toMatchObject({ id: "u1", email: base.email, name: base.name });
      const arg = userCreate.mock.calls[0][0];
      expect(arg.data.roles.create[0].role.connectOrCreate.where).toEqual({ name: roleName });
      expect(arg.data.staffOf.create[0]).toEqual({ storeId: "s1", staffRole });
      // senha foi hasheada (argon2) — nunca em texto puro
      expect(arg.data.passwordHash).toEqual(expect.stringContaining("$argon2"));
      expect(arg.data.passwordHash).not.toEqual(base.password);
    });
  });

  describe("listStores", () => {
    it("mapeia lojas ativas para { id, name, merchant }", async () => {
      const { svc, storeFindMany } = makeService();
      storeFindMany.mockResolvedValueOnce([
        { id: "s1", name: "Loja A", merchant: { name: "Rede X" } },
      ]);
      const res = await svc.listStores();
      expect(storeFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true }, orderBy: { name: "asc" } }),
      );
      expect(res).toEqual([{ id: "s1", name: "Loja A", merchant: "Rede X" }]);
    });
  });
});
