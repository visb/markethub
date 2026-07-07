import { MerchantVehiclesController } from "./merchant-vehicles.controller";
import type { MerchantVehiclesService } from "./merchant-vehicles.service";
import type { AuthUser } from "../auth";

/**
 * Story 14: controller fino da frota de veículos. Apenas delegação para o
 * `MerchantVehiclesService` (escopo/validação ficam no service). O `CurrentUser`
 * é reduzido a `{ id, roles }` antes de descer ao service.
 */
function makeController() {
  const svc = {
    list: jest.fn().mockResolvedValue([{ id: "v1" }]),
    create: jest.fn().mockResolvedValue({ id: "v1" }),
    update: jest.fn().mockResolvedValue({ id: "v1" }),
    remove: jest.fn().mockResolvedValue({ id: "v1", active: false }),
  };
  const controller = new MerchantVehiclesController(svc as unknown as MerchantVehiclesService);
  return { controller, svc };
}

const user: AuthUser = { id: "u1", email: "o@x.com", roles: ["merchant"] };

describe("MerchantVehiclesController (story 14)", () => {
  it("list: delega passando { id, roles } e o merchantId opcional", async () => {
    const { controller, svc } = makeController();
    const res = await controller.list(user, "mer1");
    expect(svc.list).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "mer1");
    expect(res).toEqual([{ id: "v1" }]);
  });

  it("list: sem merchantId repassa undefined", async () => {
    const { controller, svc } = makeController();
    await controller.list(user);
    expect(svc.list).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, undefined);
  });

  it("create: delega o dto ao service", async () => {
    const { controller, svc } = makeController();
    const dto = { plate: "ABC1D23", type: "car" as const };
    await controller.create(user, dto);
    expect(svc.create).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, dto);
  });

  it("update: delega id + patch ao service", async () => {
    const { controller, svc } = makeController();
    const dto = { active: false };
    await controller.update(user, "v1", dto);
    expect(svc.update).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "v1", dto);
  });

  it("remove: hard=true só quando a query é a string 'true'", async () => {
    const { controller, svc } = makeController();
    await controller.remove(user, "v1", "true");
    expect(svc.remove).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "v1", true);
  });

  it("remove: qualquer outro valor (ou ausente) → soft (hard=false)", async () => {
    const { controller, svc } = makeController();
    await controller.remove(user, "v1");
    expect(svc.remove).toHaveBeenLastCalledWith({ id: "u1", roles: ["merchant"] }, "v1", false);
    await controller.remove(user, "v1", "1");
    expect(svc.remove).toHaveBeenLastCalledWith({ id: "u1", roles: ["merchant"] }, "v1", false);
  });
});
