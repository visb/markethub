import { BadRequestException } from "@nestjs/common";
import type { AuthUser } from "../auth";
import { StoreDeliveriesController } from "./store-deliveries.controller";
import type { StoreDeliveryService } from "./store-delivery.service";

/**
 * Despacho de entregas pela loja — controller fino: delega ao StoreDeliveryService
 * (escopo/guards no service). Story 61 adiciona o reenvio (retry) de entrega falha.
 */
function makeController() {
  const store = {
    queue: jest.fn().mockResolvedValue([{ id: "d1" }]),
    drivers: jest.fn().mockResolvedValue([{ id: "drv1" }]),
    assign: jest.fn().mockResolvedValue({ id: "d1" }),
    unassign: jest.fn().mockResolvedValue({ id: "d1" }),
    retry: jest.fn().mockResolvedValue({ id: "d1" }),
    handover: jest.fn().mockResolvedValue({ delivered: true }),
  };
  const controller = new StoreDeliveriesController(store as unknown as StoreDeliveryService);
  return { controller, store };
}

const user: AuthUser = { id: "u1", email: "m@x.com", roles: ["merchant"] };

describe("StoreDeliveriesController", () => {
  it("deliveries: exige storeId", () => {
    const { controller } = makeController();
    expect(() => controller.deliveries(user)).toThrow(BadRequestException);
  });

  it("deliveries: delega queue(user, storeId, status)", () => {
    const { controller, store } = makeController();
    controller.deliveries(user, "s1", "failed");
    expect(store.queue).toHaveBeenCalledWith("u1", "s1", "failed");
  });

  it("drivers: exige storeId", () => {
    const { controller } = makeController();
    expect(() => controller.drivers(user)).toThrow(BadRequestException);
  });

  it("drivers: delega drivers(user, storeId)", () => {
    const { controller, store } = makeController();
    controller.drivers(user, "s1");
    expect(store.drivers).toHaveBeenCalledWith("u1", "s1");
  });

  it("assign: extrai o driverId do dto", () => {
    const { controller, store } = makeController();
    controller.assign(user, "d1", { driverId: "drv1" });
    expect(store.assign).toHaveBeenCalledWith("u1", "d1", "drv1");
  });

  it("unassign: delega user.id + id", () => {
    const { controller, store } = makeController();
    controller.unassign(user, "d1");
    expect(store.unassign).toHaveBeenCalledWith("u1", "d1");
  });

  it("retry: delega user.id + id (story 61)", () => {
    const { controller, store } = makeController();
    controller.retry(user, "d1");
    expect(store.retry).toHaveBeenCalledWith("u1", "d1");
  });

  it("handover: extrai o code do dto", () => {
    const { controller, store } = makeController();
    controller.handover(user, "g1", { code: "AB12" });
    expect(store.handover).toHaveBeenCalledWith("u1", "g1", "AB12");
  });
});
