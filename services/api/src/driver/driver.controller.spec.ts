import { DriverController } from "./driver.controller";
import type { DriverService } from "./driver.service";
import type { DriverAvailabilityService } from "./driver-availability.service";
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
    fail: jest.fn().mockResolvedValue({ id: "d1" }),
    earnings: jest.fn().mockResolvedValue({ tipsPaidCents: 0 }),
    deliveryHistory: jest.fn().mockResolvedValue({ items: [] }),
  };
  const vehicles = {
    listAvailable: jest.fn().mockResolvedValue([{ id: "v1" }]),
    current: jest.fn().mockResolvedValue({ id: "v1" }),
    select: jest.fn().mockResolvedValue({ id: "v1" }),
  };
  const location = {
    ingest: jest.fn().mockResolvedValue({ accepted: true }),
  };
  const availability = {
    current: jest.fn().mockResolvedValue({ available: true, availableSince: "2026-07-12T10:00:00.000Z" }),
    set: jest.fn().mockResolvedValue({ available: false, availableSince: null }),
  };
  const controller = new DriverController(
    driver as unknown as DriverService,
    vehicles as unknown as DriverVehicleService,
    location as unknown as DriverLocationService,
    availability as unknown as DriverAvailabilityService,
  );
  return { controller, driver, vehicles, location, availability };
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

  it("fail: repassa motivo + observação do dto (story 61)", () => {
    const { controller, driver } = makeController();
    controller.fail(user, "d1", { reason: "customer_absent", note: "portão fechado" });
    expect(driver.fail).toHaveBeenCalledWith("u1", "d1", "customer_absent", "portão fechado");
  });

  // ── Ganhos e histórico (story 60) ──

  it("earnings: repassa o período do query (default today)", () => {
    const { controller, driver } = makeController();
    controller.earnings(user, { period: "7d" });
    expect(driver.earnings).toHaveBeenCalledWith("u1", "7d");
    controller.earnings(user, {});
    expect(driver.earnings).toHaveBeenLastCalledWith("u1", "today");
  });

  it("deliveryHistory: converte page para número e repassa o período (default page 1, 30d)", () => {
    const { controller, driver } = makeController();
    controller.deliveryHistory(user, { page: "3", period: "7d" });
    expect(driver.deliveryHistory).toHaveBeenCalledWith("u1", 3, "7d");
    // sem query: page 1 e período 30d (compat, story 79)
    controller.deliveryHistory(user, {});
    expect(driver.deliveryHistory).toHaveBeenLastCalledWith("u1", 1, "30d");
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

  // ── Turno on/off / disponibilidade (story 62) ──

  it("driverAvailability: delega current(user.id)", () => {
    const { controller, availability } = makeController();
    controller.driverAvailability(user);
    expect(availability.current).toHaveBeenCalledWith("u1");
  });

  it("setAvailability: extrai o flag do dto e delega set(user.id, available)", () => {
    const { controller, availability } = makeController();
    controller.setAvailability(user, { available: true });
    expect(availability.set).toHaveBeenCalledWith("u1", true);
    controller.setAvailability(user, { available: false });
    expect(availability.set).toHaveBeenLastCalledWith("u1", false);
  });

  // ── Rastreio ao vivo (story 51) ──

  it("publishLocation: delega ao DriverLocationService com user.id + id + dto", () => {
    const { controller, location } = makeController();
    const dto = { lat: -23.5, lng: -46.6, heading: 90, recordedAt: "2026-07-11T12:00:00.000Z" };
    controller.publishLocation(user, "d1", dto);
    expect(location.ingest).toHaveBeenCalledWith("u1", "d1", dto);
  });
});
