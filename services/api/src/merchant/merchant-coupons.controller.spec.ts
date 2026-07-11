import { MerchantCouponsController } from "./merchant-coupons.controller";
import type { MerchantCouponsService } from "./merchant-coupons.service";
import type { AuthUser } from "../auth";

/** Story 53: controller fino de cupons da rede — só delega ao service. */
function makeController() {
  const svc = {
    list: jest.fn().mockResolvedValue([{ id: "c1" }]),
    create: jest.fn().mockResolvedValue({ id: "c1" }),
    update: jest.fn().mockResolvedValue({ id: "c1" }),
    remove: jest.fn().mockResolvedValue({ id: "c1", removed: true }),
  };
  const controller = new MerchantCouponsController(svc as unknown as MerchantCouponsService);
  return { controller, svc };
}

const user: AuthUser = { id: "u1", email: "o@x.com", roles: ["merchant"] };

describe("MerchantCouponsController (story 53)", () => {
  it("list: delega { id, roles } + merchantId opcional", async () => {
    const { controller, svc } = makeController();
    const res = await controller.list(user, "mer1");
    expect(svc.list).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "mer1");
    expect(res).toEqual([{ id: "c1" }]);
  });

  it("create: delega o dto", async () => {
    const { controller, svc } = makeController();
    const dto = { code: "X10", type: "percent" as const, value: 10 };
    await controller.create(user, dto);
    expect(svc.create).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, dto);
  });

  it("update: delega id + patch", async () => {
    const { controller, svc } = makeController();
    await controller.update(user, "c1", { active: false });
    expect(svc.update).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "c1", {
      active: false,
    });
  });

  it("remove: delega id", async () => {
    const { controller, svc } = makeController();
    await controller.remove(user, "c1");
    expect(svc.remove).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "c1");
  });
});
