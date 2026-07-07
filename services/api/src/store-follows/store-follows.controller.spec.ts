import { StoreFollowsController } from "./store-follows.controller";
import type { StoreFollowsService } from "./store-follows.service";
import type { AuthUser } from "../auth";

/** Story 34: controller fino delega ao service com o id do usuário corrente. */
function make() {
  const svc = {
    list: jest.fn().mockResolvedValue([{ storeId: "s1" }]),
    follow: jest.fn().mockResolvedValue({ id: "f1" }),
    unfollow: jest.fn().mockResolvedValue({ storeId: "s1", removed: true }),
  };
  const controller = new StoreFollowsController(svc as unknown as StoreFollowsService);
  const user: AuthUser = { id: "u1", email: "c@x.com", roles: ["customer"] };
  return { controller, svc, user };
}

describe("StoreFollowsController", () => {
  it("GET list delega com user.id", async () => {
    const { controller, svc, user } = make();
    expect(await controller.list(user)).toEqual([{ storeId: "s1" }]);
    expect(svc.list).toHaveBeenCalledWith("u1");
  });

  it("POST follow delega com user.id + storeId do DTO", async () => {
    const { controller, svc, user } = make();
    await controller.follow(user, { storeId: "s1" });
    expect(svc.follow).toHaveBeenCalledWith("u1", "s1");
  });

  it("DELETE unfollow delega com user.id + storeId do param", async () => {
    const { controller, svc, user } = make();
    expect(await controller.unfollow(user, "s1")).toEqual({ storeId: "s1", removed: true });
    expect(svc.unfollow).toHaveBeenCalledWith("u1", "s1");
  });
});
