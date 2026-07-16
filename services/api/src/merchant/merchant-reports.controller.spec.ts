import { MerchantReportsController } from "./merchant-reports.controller";
import type { MerchantReportsService } from "./merchant-reports.service";
import type { AuthUser } from "../auth";

/**
 * Controller fino dos relatórios do merchant — cada rota delega ao service com
 * identidade + filtro (escopo reforçado no service). Inclui a rota nova
 * `pickers` (story 65 — separação por colaborador).
 */
function make() {
  const reports = {
    sales: jest.fn().mockResolvedValue({}),
    operations: jest.fn().mockResolvedValue({}),
    topProducts: jest.fn().mockResolvedValue({}),
    pickers: jest.fn().mockResolvedValue({ rows: [] }),
    reviews: jest.fn().mockResolvedValue({}),
  };
  const controller = new MerchantReportsController(reports as unknown as MerchantReportsService);
  const user: AuthUser = { id: "u1", email: "m@x.com", roles: ["merchant"] };
  return { controller, reports, user };
}

const ident = { id: "u1", roles: ["merchant"] };
const filter = { from: "2026-07-01", to: "2026-07-15", storeId: "s1" };

describe("MerchantReportsController", () => {
  it("GET sales/operations/reviews delegam com identidade + filtro", async () => {
    const { controller, reports, user } = make();
    await controller.sales(user, filter.from, filter.to, filter.storeId);
    expect(reports.sales).toHaveBeenCalledWith(ident, filter);
    await controller.operations(user, filter.from, filter.to, filter.storeId);
    expect(reports.operations).toHaveBeenCalledWith(ident, filter);
    await controller.reviews(user, filter.from, filter.to, filter.storeId);
    expect(reports.reviews).toHaveBeenCalledWith(ident, filter);
  });

  it("GET top-products converte limit numérico (ausente → undefined)", async () => {
    const { controller, reports, user } = make();
    await controller.topProducts(user, undefined, undefined, undefined, "5");
    expect(reports.topProducts).toHaveBeenCalledWith(ident, { from: undefined, to: undefined, storeId: undefined }, 5);
    await controller.topProducts(user);
    expect(reports.topProducts).toHaveBeenLastCalledWith(ident, { from: undefined, to: undefined, storeId: undefined }, undefined);
  });

  it("GET pickers delega com identidade + filtro (story 65)", async () => {
    const { controller, reports, user } = make();
    await controller.pickers(user, filter.from, filter.to, filter.storeId);
    expect(reports.pickers).toHaveBeenCalledWith(ident, filter);
  });
});
