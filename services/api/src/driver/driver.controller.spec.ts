import { DriverController } from "./driver.controller";
import type { DriverService } from "./driver.service";
import type { DriverVehicleService } from "./driver-vehicle.service";
import type { DriverLocationService } from "./driver-location.service";
import type { AuthUser } from "../auth";

/**
 * App do entregador (entrega própria). Controller fino: delega ao `DriverService`
 * (lojas/entregas/coleta/entrega) e ao `DriverVehicleService` (seleção de veículo,
 * story 15). Regra/escopo ficam nos services.
 */
function makeController() {
  const driver = {
    myStores: jest.fn().mockResolvedValue([{ id: "s1" }]),
    listAssigned: jest.fn().mockResolvedValue([{ id: "d1" }]),
    listAvailable: jest.fn().mockResolvedValue([{ id: "d2" }]),
    accept: jest.fn().mockResolvedValue({ id: "d1" }),
    confirmPickup: jest.fn().mockResolvedValue({ id: "d1" }),
    confirmDelivery: jest.fn().mockResolvedValue({ id: "d1" }),
  };
  const vehicles = {
    listAvailable: jest.fn().mockResolvedValue([{ id: "v1" }]),
    current: jest.fn().mockResolvedValue({ id: "v1" }),
    select: jest.fn().mockResolvedValue({ id: "v1" }),
  };
  const location = {
    ingest: jest.fn().mockResolvedValue({ accepted: true }),
  };
  const controller = new DriverController(
    driver as unknown as DriverService,
    vehicles as unknown as DriverVehicleService,
    location as unknown as DriverLocationService,
  );
  return { controller, driver, vehicles, location };
}

const user: AuthUser = { id: "u1", email: "d@x.com", roles: ["driver"] };

describe("DriverController", () => {
  it("stores: delega myStores(user.id)", () => {
    const { controller, driver } = makeController();
    controller.stores(user);
    expect(driver.myStores).toHaveBeenCalledWith("u1");
  });

  it("deliveries: repassa filtros storeId/status", () => {
    const { controller, driver } = makeController();
    controller.deliveries(user, "s1", "on_the_way");
    expect(driver.listAssigned).toHaveBeenCalledWith("u1", { storeId: "s1", status: "on_the_way" });
  });

  it("available: repassa storeId", () => {
    const { controller, driver } = makeController();
    controller.available(user, "s1");
    expect(driver.listAvailable).toHaveBeenCalledWith("u1", { storeId: "s1" });
  });

  it("accept: delega user.id + id", () => {
    const { controller, driver } = makeController();
    controller.accept(user, "d1");
    expect(driver.accept).toHaveBeenCalledWith("u1", "d1");
  });

  it("pickup: extrai o pickupCode do dto", () => {
    const { controller, driver } = makeController();
    controller.pickup(user, "d1", { pickupCode: "1234" });
    expect(driver.confirmPickup).toHaveBeenCalledWith("u1", "d1", "1234");
  });

  it("deliver: extrai o deliveryCode do dto", () => {
    const { controller, driver } = makeController();
    controller.deliver(user, "d1", { deliveryCode: "9999" });
    expect(driver.confirmDelivery).toHaveBeenCalledWith("u1", "d1", "9999");
  });

  // ── Seleção de veículo (story 15) ──

  it("vehicles_: lista os veículos disponíveis da rede", () => {
    const { controller, vehicles } = makeController();
    controller.vehicles_(user);
    expect(vehicles.listAvailable).toHaveBeenCalledWith("u1");
  });

  it("currentVehicle: delega current(user.id)", () => {
    const { controller, vehicles } = makeController();
    controller.currentVehicle(user);
    expect(vehicles.current).toHaveBeenCalledWith("u1");
  });

  it("selectVehicle: extrai o vehicleId do dto", () => {
    const { controller, vehicles } = makeController();
    controller.selectVehicle(user, { vehicleId: "v1" });
    expect(vehicles.select).toHaveBeenCalledWith("u1", "v1");
  });

  // ── Rastreio ao vivo (story 51) ──

  it("publishLocation: delega ao DriverLocationService com user.id + id + dto", () => {
    const { controller, location } = makeController();
    const dto = { lat: -23.5, lng: -46.6, heading: 90, recordedAt: "2026-07-11T12:00:00.000Z" };
    controller.publishLocation(user, "d1", dto);
    expect(location.ingest).toHaveBeenCalledWith("u1", "d1", dto);
  });
});
