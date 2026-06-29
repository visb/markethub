import { MerchantStaffController } from "./merchant-staff.controller";
import type { MerchantStaffService } from "./merchant-staff.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * Story 10: controller fino de colaboradores (StoreStaff). Apenas delegação ao
 * `MerchantStaffService`, reduzindo o `CurrentUser` a `{ id, roles }`.
 */
function makeController() {
  const svc = {
    list: jest.fn().mockResolvedValue([{ id: "st1" }]),
    create: jest.fn().mockResolvedValue({ id: "st1" }),
    update: jest.fn().mockResolvedValue({ id: "st1" }),
    remove: jest.fn().mockResolvedValue({ id: "st1", active: false }),
  };
  const controller = new MerchantStaffController(svc as unknown as MerchantStaffService);
  return { controller, svc };
}

const user: AuthUser = { id: "u1", email: "o@x.com", roles: ["merchant"] };

describe("MerchantStaffController (story 10)", () => {
  it("list: delega { id, roles } + storeId opcional", async () => {
    const { controller, svc } = makeController();
    const res = await controller.list(user, "sA");
    expect(svc.list).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "sA");
    expect(res).toEqual([{ id: "st1" }]);
  });

  it("create: delega o dto", async () => {
    const { controller, svc } = makeController();
    const dto = {
      name: "N",
      email: "n@x.z",
      password: "secret1",
      staffRole: "picker" as const,
      storeId: "sA",
    };
    await controller.create(user, dto);
    expect(svc.create).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, dto);
  });

  it("update: delega id + patch", async () => {
    const { controller, svc } = makeController();
    await controller.update(user, "st1", { active: false });
    expect(svc.update).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "st1", {
      active: false,
    });
  });

  it("remove: hard=true só com a query string 'true'; senão soft", async () => {
    const { controller, svc } = makeController();
    await controller.remove(user, "st1", "true");
    expect(svc.remove).toHaveBeenLastCalledWith({ id: "u1", roles: ["merchant"] }, "st1", true);
    await controller.remove(user, "st1");
    expect(svc.remove).toHaveBeenLastCalledWith({ id: "u1", roles: ["merchant"] }, "st1", false);
  });
});
