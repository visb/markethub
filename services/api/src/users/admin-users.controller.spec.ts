import { AdminStoresController, AdminUsersController } from "./admin-users.controller";
import type { AdminUsersService } from "./admin-users.service";

/**
 * Story 24: controllers finos de usuários admin — só roteiam ao service.
 * Cobre conversão de query params (string→number, ausente→undefined) e o
 * roteamento de cada rota (list, detail, setActive, createStaff, listStores).
 */
function make() {
  const users = {
    list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
    detail: jest.fn().mockResolvedValue({ id: "u1" }),
    setActive: jest.fn().mockResolvedValue({ id: "u1", active: false }),
    createStaff: jest.fn().mockResolvedValue({ id: "u2", email: "x@y.z", name: "X" }),
    listStores: jest.fn().mockResolvedValue([{ id: "s1", name: "Loja", merchant: "Rede" }]),
  };
  return {
    usersCtrl: new AdminUsersController(users as unknown as AdminUsersService),
    storesCtrl: new AdminStoresController(users as unknown as AdminUsersService),
    users,
  };
}

describe("AdminUsersController (story 24)", () => {
  it("list: converte page/pageSize string→number e repassa role/search", async () => {
    const { usersCtrl, users } = make();
    await usersCtrl.list("picker", "ana", "2", "30");
    expect(users.list).toHaveBeenCalledWith({
      role: "picker",
      search: "ana",
      page: 2,
      pageSize: 30,
    });
  });

  it("list: params de paginação ausentes viram undefined", async () => {
    const { usersCtrl, users } = make();
    await usersCtrl.list();
    expect(users.list).toHaveBeenCalledWith({
      role: undefined,
      search: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("detail: roteia id ao service", async () => {
    const { usersCtrl, users } = make();
    const res = await usersCtrl.detail("u1");
    expect(users.detail).toHaveBeenCalledWith("u1");
    expect(res).toMatchObject({ id: "u1" });
  });

  it("setActive: repassa id + dto.active", async () => {
    const { usersCtrl, users } = make();
    await usersCtrl.setActive("u1", { active: false });
    expect(users.setActive).toHaveBeenCalledWith("u1", false);
  });

  it("createStaff: delega o dto ao service", async () => {
    const { usersCtrl, users } = make();
    const dto = {
      email: "x@y.z",
      name: "X",
      password: "secret12",
      staffRole: "picker" as const,
      storeId: "s1",
    };
    const res = await usersCtrl.createStaff(dto);
    expect(users.createStaff).toHaveBeenCalledWith(dto);
    expect(res).toMatchObject({ id: "u2" });
  });
});

describe("AdminStoresController (story 24)", () => {
  it("list: delega ao listStores", async () => {
    const { storesCtrl, users } = make();
    const res = await storesCtrl.list();
    expect(users.listStores).toHaveBeenCalled();
    expect(res).toEqual([{ id: "s1", name: "Loja", merchant: "Rede" }]);
  });
});
