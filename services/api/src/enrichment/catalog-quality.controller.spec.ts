import { CatalogQualityController } from "./catalog-quality.controller";
import type { CatalogQualityService } from "./catalog-quality.service";

function make() {
  const svc = {
    summary: jest.fn().mockResolvedValue({}),
    incomplete: jest.fn().mockResolvedValue([]),
    requeue: jest.fn().mockResolvedValue({}),
    snapshots: jest.fn().mockResolvedValue([]),
    captureSnapshot: jest.fn().mockResolvedValue({}),
  };
  return { svc, controller: new CatalogQualityController(svc as unknown as CatalogQualityService) };
}

describe("CatalogQualityController", () => {
  it("summary repassa filtros", () => {
    const { controller, svc } = make();
    controller.summary("s1", "c1");
    expect(svc.summary).toHaveBeenCalledWith({ storeId: "s1", categoryId: "c1" });
  });

  it("incomplete converte limit numérico (undefined quando ausente)", () => {
    const { controller, svc } = make();
    controller.incomplete("s1", "c1", "10");
    expect(svc.incomplete).toHaveBeenCalledWith({ storeId: "s1", categoryId: "c1", limit: 10 });
    controller.incomplete();
    expect(svc.incomplete).toHaveBeenLastCalledWith({
      storeId: undefined,
      categoryId: undefined,
      limit: undefined,
    });
  });

  it("requeue repassa productId do body", () => {
    const { controller, svc } = make();
    controller.requeue({ productId: "p1" });
    expect(svc.requeue).toHaveBeenCalledWith("p1");
  });

  it("snapshots converte limit; capture delega", () => {
    const { controller, svc } = make();
    controller.snapshots("15");
    expect(svc.snapshots).toHaveBeenCalledWith(15);
    controller.snapshots();
    expect(svc.snapshots).toHaveBeenLastCalledWith(undefined);
    controller.capture();
    expect(svc.captureSnapshot).toHaveBeenCalled();
  });
});
