import { AdminDashboardController } from "./admin-dashboard.controller";
import type { AdminDashboardService } from "./admin-dashboard.service";
import type { ReviewsAggregateService } from "../reviews/reviews-aggregate.service";

/**
 * Backfill de cobertura (story 28). Controller fino: valida o roteamento e a
 * conversão de query string (datas/paginação) para o service. Caminho feliz.
 */

function makeController() {
  const dashboard = {
    orders: jest.fn().mockResolvedValue({ items: [] }),
    orderDetail: jest.fn().mockResolvedValue({ id: "o1" }),
    operations: jest.fn().mockResolvedValue({}),
    finance: jest.fn().mockResolvedValue({}),
    driverTips: jest.fn().mockResolvedValue([]),
  } as unknown as AdminDashboardService;
  const reviews = {
    platform: jest.fn().mockResolvedValue({ axis: "platform", average: 4, count: 1 }),
  } as unknown as ReviewsAggregateService;
  return { ctrl: new AdminDashboardController(dashboard, reviews), dashboard, reviews };
}

describe("AdminDashboardController", () => {
  it("orders converte filtros e paginação", () => {
    const { ctrl, dashboard } = makeController();
    ctrl.orders("delivered", "s1", "2026-01-01", "2026-02-01", "2", "30");
    expect(dashboard.orders).toHaveBeenCalledWith({
      status: "delivered",
      storeId: "s1",
      from: new Date("2026-01-01"),
      to: new Date("2026-02-01"),
      page: 2,
      pageSize: 30,
    });
  });

  it("orders sem query usa undefined", () => {
    const { ctrl, dashboard } = makeController();
    ctrl.orders();
    expect(dashboard.orders).toHaveBeenCalledWith({
      status: undefined,
      storeId: undefined,
      from: undefined,
      to: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("orderDetail delega o id", () => {
    const { ctrl, dashboard } = makeController();
    ctrl.orderDetail("o1");
    expect(dashboard.orderDetail).toHaveBeenCalledWith("o1");
  });

  it("operations delega storeId", () => {
    const { ctrl, dashboard } = makeController();
    ctrl.operations("s2");
    expect(dashboard.operations).toHaveBeenCalledWith("s2");
  });

  it("finance converte datas", () => {
    const { ctrl, dashboard } = makeController();
    ctrl.finance("2026-01-01", "2026-02-01", "s1");
    expect(dashboard.finance).toHaveBeenCalledWith({
      from: new Date("2026-01-01"),
      to: new Date("2026-02-01"),
      storeId: "s1",
    });
  });

  it("driverTips converte datas", () => {
    const { ctrl, dashboard } = makeController();
    ctrl.driverTips("2026-01-01");
    expect(dashboard.driverTips).toHaveBeenCalledWith({
      from: new Date("2026-01-01"),
      to: undefined,
    });
  });

  it("reviewsAgg delega ao agregado de plataforma", () => {
    const { ctrl, reviews } = makeController();
    ctrl.reviewsAgg();
    expect(reviews.platform).toHaveBeenCalled();
  });
});
