import { MerchantOrdersController } from "./merchant-orders.controller";

/**
 * Story 12/54: o controller é fino — só roteia p/ o MerchantService passando o
 * ator (id + roles). Escopo/capabilities são reforçados no service (coberto lá).
 */
function make() {
  const merchant = {
    listOrders: jest.fn().mockResolvedValue(["ok"]),
    orderGroupDetail: jest.fn().mockResolvedValue({ id: "g1" }),
    cancelOrderGroup: jest.fn().mockResolvedValue({ id: "g1", status: "canceled" }),
  };
  return { ctrl: new MerchantOrdersController(merchant as never), merchant };
}

const user = { id: "u1", roles: ["merchant"] } as never;

describe("MerchantOrdersController", () => {
  it("listOrders repassa o ator + filtros", async () => {
    const { ctrl, merchant } = make();
    await ctrl.listOrders(user, "s1", "paid");
    expect(merchant.listOrders).toHaveBeenCalledWith(
      { id: "u1", roles: ["merchant"] },
      { storeId: "s1", status: "paid" },
    );
  });

  it("orderGroupDetail repassa o ator + id do grupo", async () => {
    const { ctrl, merchant } = make();
    await ctrl.orderGroupDetail(user, "g1");
    expect(merchant.orderGroupDetail).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "g1");
  });

  it("cancelOrderGroup repassa o ator + id do grupo", async () => {
    const { ctrl, merchant } = make();
    const res = await ctrl.cancelOrderGroup(user, "g1", {});
    expect(merchant.cancelOrderGroup).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "g1");
    expect(res).toMatchObject({ status: "canceled" });
  });
});
