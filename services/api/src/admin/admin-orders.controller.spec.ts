import { AdminOrdersController } from "./admin-orders.controller";
import type { AdminOrderSupportService } from "./admin-order-support.service";

/**
 * Story 67: controller fino das ferramentas de suporte — valida só o roteamento
 * (timeline, cancel com motivo opcional, refund com createdById do admin logado).
 */

function makeController() {
  const support = {
    timeline: jest.fn().mockResolvedValue([]),
    cancel: jest.fn().mockResolvedValue({ status: "canceled" }),
    manualRefund: jest.fn().mockResolvedValue({ status: "requested" }),
  } as unknown as AdminOrderSupportService;
  return { ctrl: new AdminOrdersController(support), support };
}

const admin = { id: "admin1", email: "a@a.com", roles: ["admin" as const] };

describe("AdminOrdersController", () => {
  it("timeline delega o id", () => {
    const { ctrl, support } = makeController();
    ctrl.timeline("o1");
    expect(support.timeline).toHaveBeenCalledWith("o1");
  });

  it("cancel delega id + motivo (ausente vira null)", () => {
    const { ctrl, support } = makeController();
    ctrl.cancel("o1", { reason: "cliente pediu" });
    expect(support.cancel).toHaveBeenCalledWith("o1", "cliente pediu");
    ctrl.cancel("o1", {});
    expect(support.cancel).toHaveBeenCalledWith("o1", null);
  });

  it("refund delega com o id do admin logado (createdById) e nota opcional", () => {
    const { ctrl, support } = makeController();
    ctrl.refund("o1", admin, { orderGroupId: "g1", amountCents: 2500, note: "ok" });
    expect(support.manualRefund).toHaveBeenCalledWith("o1", "admin1", {
      orderGroupId: "g1",
      amountCents: 2500,
      note: "ok",
    });
    ctrl.refund("o1", admin, { orderGroupId: "g1", amountCents: 100 });
    expect(support.manualRefund).toHaveBeenCalledWith("o1", "admin1", {
      orderGroupId: "g1",
      amountCents: 100,
      note: null,
    });
  });
});
