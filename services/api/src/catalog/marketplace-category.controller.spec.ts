import {
  AdminMarketplaceCategoryController,
  MarketplaceCategoryPublicController,
} from "./marketplace-category.controller";
import type { MarketplaceCategoryService } from "./marketplace-category.service";

function makeSvc() {
  return {
    listPublic: jest.fn().mockResolvedValue([]),
    listAdmin: jest.fn().mockResolvedValue([]),
    listRawCategories: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
    assignRaw: jest.fn().mockResolvedValue({}),
  };
}

describe("MarketplaceCategoryPublicController", () => {
  it("list delega listPublic", () => {
    const svc = makeSvc();
    new MarketplaceCategoryPublicController(svc as unknown as MarketplaceCategoryService).list();
    expect(svc.listPublic).toHaveBeenCalled();
  });
});

describe("AdminMarketplaceCategoryController", () => {
  function make() {
    const svc = makeSvc();
    return {
      svc,
      controller: new AdminMarketplaceCategoryController(
        svc as unknown as MarketplaceCategoryService,
      ),
    };
  }

  it("list/rawCategories/create/update/remove delegam ao service", () => {
    const { controller, svc } = make();
    controller.list();
    controller.rawCategories();
    controller.create({ name: "Bebidas" });
    controller.update("mc1", { visible: false });
    controller.remove("mc1");
    expect(svc.listAdmin).toHaveBeenCalled();
    expect(svc.listRawCategories).toHaveBeenCalled();
    expect(svc.create).toHaveBeenCalledWith({ name: "Bebidas" });
    expect(svc.update).toHaveBeenCalledWith("mc1", { visible: false });
    expect(svc.remove).toHaveBeenCalledWith("mc1");
  });

  it("assignRaw usa o id do body, default null quando ausente", () => {
    const { controller, svc } = make();
    controller.assignRaw("c1", { marketplaceCategoryId: "mc1" });
    expect(svc.assignRaw).toHaveBeenCalledWith("c1", "mc1");
    controller.assignRaw("c1", {});
    expect(svc.assignRaw).toHaveBeenLastCalledWith("c1", null);
  });
});
