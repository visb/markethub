import { AdminCouponsController } from "./admin-coupons.controller";
import type { AdminCouponsService } from "./admin-coupons.service";

/** Story 53: controller fino de cupons do admin — só delega ao service. */
function makeController() {
  const svc = {
    list: jest.fn().mockResolvedValue([{ id: "c1" }]),
    create: jest.fn().mockResolvedValue({ id: "c1" }),
    update: jest.fn().mockResolvedValue({ id: "c1" }),
    remove: jest.fn().mockResolvedValue({ id: "c1", removed: true }),
  };
  const controller = new AdminCouponsController(svc as unknown as AdminCouponsService);
  return { controller, svc };
}

describe("AdminCouponsController (story 53)", () => {
  it("list: delega o filtro merchantId", async () => {
    const { controller, svc } = makeController();
    const res = await controller.list("global");
    expect(svc.list).toHaveBeenCalledWith("global");
    expect(res).toEqual([{ id: "c1" }]);
  });

  it("create: delega o dto", async () => {
    const { controller, svc } = makeController();
    const dto = { code: "X10", type: "percent" as const, value: 10 };
    await controller.create(dto);
    expect(svc.create).toHaveBeenCalledWith(dto);
  });

  it("update: delega id + patch", async () => {
    const { controller, svc } = makeController();
    await controller.update("c1", { active: false });
    expect(svc.update).toHaveBeenCalledWith("c1", { active: false });
  });

  it("remove: delega id", async () => {
    const { controller, svc } = makeController();
    await controller.remove("c1");
    expect(svc.remove).toHaveBeenCalledWith("c1");
  });
});
