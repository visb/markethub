import { OrdersController } from "./orders.controller";
import type { OrdersService } from "./orders.service";

/**
 * Story 21: controller fino de pedidos — só roteia ao service. Cobre caminho
 * feliz das 4 rotas (list, detail, tracking, cancel) e a validação/conversão dos
 * query params de paginação (string → number, undefined quando ausente).
 */

const user = { id: "u1", roles: ["customer"] } as never;

function makeController() {
  const orders = {
    list: jest.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20 }),
    detail: jest.fn().mockResolvedValue({ id: "o1" }),
    getTracking: jest.fn().mockResolvedValue({ steps: [] }),
    cancel: jest.fn().mockResolvedValue({ id: "o1", status: "canceled" }),
  };
  return { ctrl: new OrdersController(orders as unknown as OrdersService), orders };
}

describe("OrdersController", () => {
  it("list: converte page/pageSize de string para number", async () => {
    const { ctrl, orders } = makeController();
    await ctrl.list(user, "2", "30");
    expect(orders.list).toHaveBeenCalledWith("u1", { page: 2, pageSize: 30 });
  });

  it("list: params ausentes viram undefined", async () => {
    const { ctrl, orders } = makeController();
    await ctrl.list(user);
    expect(orders.list).toHaveBeenCalledWith("u1", { page: undefined, pageSize: undefined });
  });

  it("detail: roteia id + usuário ao service", async () => {
    const { ctrl, orders } = makeController();
    const res = await ctrl.detail(user, "o1");
    expect(orders.detail).toHaveBeenCalledWith("u1", "o1");
    expect(res).toMatchObject({ id: "o1" });
  });

  it("tracking: delega ao getTracking", async () => {
    const { ctrl, orders } = makeController();
    await ctrl.tracking(user, "o1");
    expect(orders.getTracking).toHaveBeenCalledWith("u1", "o1");
  });

  it("cancel: delega ao cancel do service", async () => {
    const { ctrl, orders } = makeController();
    const res = await ctrl.cancel(user, "o1");
    expect(orders.cancel).toHaveBeenCalledWith("u1", "o1");
    expect(res).toMatchObject({ status: "canceled" });
  });
});
