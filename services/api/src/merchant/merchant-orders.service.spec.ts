import { ForbiddenException } from "@nestjs/common";
import { MerchantService } from "./merchant.service";

/**
 * Story 12: GET merchant/orders escopado às lojas do usuário.
 * - owner (RoleName merchant): todas as lojas das redes que possui;
 * - manager: só as dos vínculos;
 * - usuário sem vínculo → FORBIDDEN; loja fora do escopo → FORBIDDEN.
 */

const GROUP = {
  id: "g1",
  orderId: "o1",
  storeId: "s1",
  status: "preparing",
  fulfillment: "delivery",
  subtotalCents: 1000,
  deliveryCents: 500,
  prepCents: 0,
  platformFeeCents: 100,
  pickupCode: "AB12",
  store: { name: "Loja 1" },
  order: { createdAt: new Date("2026-06-22T10:00:00Z") },
  _count: { items: 3 },
};

function makeService(opts: {
  managerStores?: { id: string; name: string; merchantId: string }[];
  storesByMerchant?: { id: string }[];
}) {
  const managerStores = opts.managerStores ?? [];
  const orderGroupFindMany = jest.fn().mockResolvedValue([GROUP]);
  const storeFindMany = jest.fn().mockResolvedValue(opts.storesByMerchant ?? []);
  const prisma = {
    storeStaff: {
      findMany: jest.fn().mockResolvedValue(managerStores.map((s) => ({ store: s }))),
    },
    store: { findMany: storeFindMany },
    orderGroup: { findMany: orderGroupFindMany },
  } as never;
  const geocoding = { geocode: jest.fn() } as never;
  return { svc: new MerchantService(prisma, geocoding), orderGroupFindMany, storeFindMany };
}

const owner = { id: "u1", roles: ["merchant"] };
const manager = { id: "u2", roles: ["customer"] };
const ownerStore = { id: "s1", name: "Loja 1", merchantId: "m1" };

describe("MerchantService.listOrders (story 12)", () => {
  it("owner: escopo = todas as lojas das redes que possui", async () => {
    const { svc, orderGroupFindMany, storeFindMany } = makeService({
      managerStores: [ownerStore],
      storesByMerchant: [{ id: "s1" }, { id: "s2" }],
    });
    const res = await svc.listOrders(owner, {});
    // resolve as lojas da rede (não só os vínculos do owner)
    expect(storeFindMany).toHaveBeenCalledWith({
      where: { merchantId: { in: ["m1"] } },
      select: { id: true },
    });
    expect(orderGroupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: { in: ["s1", "s2"] } } }),
    );
    expect(res[0]).toMatchObject({
      id: "g1",
      orderId: "o1",
      storeName: "Loja 1",
      status: "preparing",
      itemCount: 3,
      totalCents: 1600,
      pickupCode: "AB12",
    });
    expect(res[0].createdAt).toBe("2026-06-22T10:00:00.000Z");
  });

  it("manager: escopo = só as lojas dos vínculos (não resolve a rede)", async () => {
    const { svc, orderGroupFindMany, storeFindMany } = makeService({
      managerStores: [ownerStore],
    });
    await svc.listOrders(manager, {});
    expect(storeFindMany).not.toHaveBeenCalled();
    expect(orderGroupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: { in: ["s1"] } } }),
    );
  });

  it("filtra por loja dentro do escopo (status incluído no where)", async () => {
    const { svc, orderGroupFindMany } = makeService({ managerStores: [ownerStore] });
    await svc.listOrders(manager, { storeId: "s1", status: "delivered" });
    expect(orderGroupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: { in: ["s1"] }, status: "delivered" } }),
    );
  });

  it("loja fora do escopo → FORBIDDEN", async () => {
    const { svc } = makeService({ managerStores: [ownerStore] });
    await expect(svc.listOrders(manager, { storeId: "outra" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("usuário sem vínculo → FORBIDDEN", async () => {
    const { svc } = makeService({ managerStores: [] });
    await expect(svc.listOrders(manager, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
