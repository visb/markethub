import { AdminCatalogController } from "./admin-catalog.controller";
import type { AdminCatalogService } from "./admin-catalog.service";
import type { EnrichmentService } from "../enrichment/enrichment.service";

/** Controller fino: delega ao service e converte page/pageSize de query. */
function makeController() {
  const admin = {
    listProducts: jest.fn().mockResolvedValue({}),
    productDetail: jest.fn().mockResolvedValue({}),
    updateProduct: jest.fn().mockResolvedValue({}),
    unlockFields: jest.fn().mockResolvedValue({}),
  };
  const enrichment = { enrichProduct: jest.fn().mockResolvedValue({}) };
  const controller = new AdminCatalogController(
    admin as unknown as AdminCatalogService,
    enrichment as unknown as EnrichmentService,
  );
  return { controller, admin, enrichment };
}

describe("AdminCatalogController", () => {
  it("list converte page/pageSize e repassa filtros", () => {
    const { controller, admin } = makeController();
    controller.list("arroz", "pending", "2", "40");
    expect(admin.listProducts).toHaveBeenCalledWith({
      search: "arroz",
      status: "pending",
      page: 2,
      pageSize: 40,
    });
  });

  it("list sem paginação envia undefined", () => {
    const { controller, admin } = makeController();
    controller.list();
    expect(admin.listProducts).toHaveBeenCalledWith({
      search: undefined,
      status: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("detail/update/unlock/enrich delegam ao service certo", () => {
    const { controller, admin, enrichment } = makeController();
    controller.detail("p1");
    controller.update("p1", { name: "Arroz" });
    controller.unlock("p1", { fields: ["brand"] });
    controller.enrich("p1");
    expect(admin.productDetail).toHaveBeenCalledWith("p1");
    expect(admin.updateProduct).toHaveBeenCalledWith("p1", { name: "Arroz" });
    expect(admin.unlockFields).toHaveBeenCalledWith("p1", ["brand"]);
    expect(enrichment.enrichProduct).toHaveBeenCalledWith("p1");
  });
});
