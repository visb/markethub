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
  groupDetail?: Record<string, unknown> | null;
}) {
  const managerStores = opts.managerStores ?? [];
  const orderGroupFindMany = jest.fn().mockResolvedValue([GROUP]);
  const orderGroupFindUnique = jest.fn().mockResolvedValue(
    "groupDetail" in opts ? opts.groupDetail : null,
  );
  const storeFindMany = jest.fn().mockResolvedValue(opts.storesByMerchant ?? []);
  const prisma = {
    storeStaff: {
      findMany: jest.fn().mockResolvedValue(managerStores.map((s) => ({ store: s }))),
      findFirst: jest.fn().mockResolvedValue(null), // sem vínculo admin (resolveLevel — story 16)
    },
    store: { findMany: storeFindMany },
    orderGroup: { findMany: orderGroupFindMany, findUnique: orderGroupFindUnique },
  } as never;
  const geocoding = { geocode: jest.fn() } as never;
  const ordersCancelGroup = jest.fn().mockResolvedValue({ id: "g1", status: "canceled", orderCanceled: false });
  const orders = { cancelGroup: ordersCancelGroup } as never;
  return {
    svc: new MerchantService(prisma, geocoding, orders),
    orderGroupFindMany,
    orderGroupFindUnique,
    storeFindMany,
    ordersCancelGroup,
  };
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

// Detalhe do sub-pedido + escopo (story 54)
const detailGroup = {
  id: "g1",
  orderId: "o1",
  storeId: "s1",
  status: "paid",
  fulfillment: "delivery",
  subtotalCents: 1000,
  deliveryCents: 500,
  prepCents: 0,
  platformFeeCents: 100,
  pickupCode: "AB12",
  store: { name: "Loja 1" },
  pickTask: { status: "queued", startedAt: null, packedAt: null, readyAt: null },
  delivery: null,
  order: {
    createdAt: new Date("2026-06-22T10:00:00Z"),
    scheduledFrom: null,
    scheduledTo: null,
    user: { name: "Cliente Um" },
    payment: { status: "paid", method: "pix", paidAt: new Date("2026-06-22T10:05:00Z") },
  },
  items: [
    {
      id: "i1",
      nameSnapshot: "Arroz",
      saleType: "unit",
      quantity: 2,
      weightGrams: null,
      unitPriceCents: 500,
      lineTotalCents: 1000,
      pickItem: {
        status: "substituted",
        quantityPicked: null,
        weightGramsPicked: null,
        substitution: {
          nameSnapshot: "Arroz B",
          unitPriceCents: 520,
          priceDiffCents: 20,
          approvalStatus: "pending",
        },
      },
    },
  ],
};

describe("MerchantService.orderGroupDetail (story 54)", () => {
  it("monta o detalhe (itens + substituição + timeline + cancelable) do grupo no escopo", async () => {
    const { svc } = makeService({ managerStores: [ownerStore], groupDetail: detailGroup });
    const res = await svc.orderGroupDetail(manager, "g1");
    expect(res).toMatchObject({
      id: "g1",
      orderId: "o1",
      storeName: "Loja 1",
      totalCents: 1600,
      customer: { name: "Cliente Um", phone: null },
      cancelable: true,
    });
    expect(res.items[0]).toMatchObject({
      name: "Arroz",
      pickStatus: "substituted",
      substitution: { name: "Arroz B", approvalStatus: "pending" },
    });
    expect(res.timeline.paidAt).toBe("2026-06-22T10:05:00.000Z");
  });

  it("cancelable=false quando a separação já começou (PickTask picking)", async () => {
    const picking = { ...detailGroup, pickTask: { status: "picking", startedAt: new Date(), packedAt: null, readyAt: null } };
    const { svc } = makeService({ managerStores: [ownerStore], groupDetail: picking });
    const res = await svc.orderGroupDetail(manager, "g1");
    expect(res.cancelable).toBe(false);
  });

  it("grupo de loja fora do escopo → 404 (não vaza existência)", async () => {
    const alheio = { ...detailGroup, storeId: "outra" };
    const { svc } = makeService({ managerStores: [ownerStore], groupDetail: alheio });
    await expect(svc.orderGroupDetail(manager, "g1")).rejects.toMatchObject({
      response: { code: "ORDER_GROUP_NOT_FOUND" },
    });
  });

  it("grupo inexistente → 404", async () => {
    const { svc } = makeService({ managerStores: [ownerStore], groupDetail: null });
    await expect(svc.orderGroupDetail(manager, "g1")).rejects.toMatchObject({
      response: { code: "ORDER_GROUP_NOT_FOUND" },
    });
  });
});

describe("MerchantService.cancelOrderGroup (story 54)", () => {
  it("resolve o escopo e delega ao marketplace (cancelGroup) com os storeIds do ator", async () => {
    const { svc, ordersCancelGroup } = makeService({ managerStores: [ownerStore] });
    const res = await svc.cancelOrderGroup(manager, "g1");
    expect(ordersCancelGroup).toHaveBeenCalledWith("g1", { storeIds: ["s1"] });
    expect(res).toMatchObject({ status: "canceled" });
  });

  it("usuário sem lojas no escopo → FORBIDDEN (não delega)", async () => {
    const { svc, ordersCancelGroup } = makeService({ managerStores: [] });
    await expect(svc.cancelOrderGroup(manager, "g1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(ordersCancelGroup).not.toHaveBeenCalled();
  });
});
