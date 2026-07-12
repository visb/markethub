import type { ApiClient } from "@markethub/api-client";
import { deliveries } from "../api/deliveries";

/**
 * Story 41: módulo de API tipado das entregas (src/api/deliveries.ts). Cada método
 * apenas delega ao ApiClient injetado — verifica a delegação e o mapeamento do
 * escopo de loja (storeId presente → { storeId }; ausente/null → {}).
 */
function setup() {
  const client = {
    driverMyStores: jest.fn().mockResolvedValue([{ id: "s1" }]),
    driverDeliveries: jest.fn().mockResolvedValue([{ id: "d1" }]),
    driverAvailableDeliveries: jest.fn().mockResolvedValue([{ id: "d2" }]),
    driverAcceptDelivery: jest.fn().mockResolvedValue({ id: "d1" }),
    driverConfirmPickup: jest.fn().mockResolvedValue({ id: "d1" }),
    driverConfirmDelivery: jest.fn().mockResolvedValue({ id: "d1" }),
    driverFailDelivery: jest.fn().mockResolvedValue({ id: "d1", status: "failed" }),
  };
  const api = deliveries(client as unknown as ApiClient);
  return { client, api };
}

describe("driver deliveries api module", () => {
  it("stores delega driverMyStores", async () => {
    const { client, api } = setup();
    await expect(api.stores()).resolves.toEqual([{ id: "s1" }]);
    expect(client.driverMyStores).toHaveBeenCalledTimes(1);
  });

  it("mine com storeId envia { storeId }", async () => {
    const { client, api } = setup();
    await api.mine("s1");
    expect(client.driverDeliveries).toHaveBeenCalledWith({ storeId: "s1" });
  });

  it("mine sem storeId (null) envia {}", async () => {
    const { client, api } = setup();
    await api.mine(null);
    expect(client.driverDeliveries).toHaveBeenCalledWith({});
  });

  it("available com storeId envia { storeId }", async () => {
    const { client, api } = setup();
    await api.available("s1");
    expect(client.driverAvailableDeliveries).toHaveBeenCalledWith({ storeId: "s1" });
  });

  it("available sem storeId envia {}", async () => {
    const { client, api } = setup();
    await api.available();
    expect(client.driverAvailableDeliveries).toHaveBeenCalledWith({});
  });

  it("accept delega driverAcceptDelivery com o id", async () => {
    const { client, api } = setup();
    await api.accept("d1");
    expect(client.driverAcceptDelivery).toHaveBeenCalledWith("d1");
  });

  it("confirmPickup delega com id + código", async () => {
    const { client, api } = setup();
    await api.confirmPickup("d1", "PC1");
    expect(client.driverConfirmPickup).toHaveBeenCalledWith("d1", "PC1");
  });

  it("confirmDelivery delega com id + código", async () => {
    const { client, api } = setup();
    await api.confirmDelivery("d1", "DC1");
    expect(client.driverConfirmDelivery).toHaveBeenCalledWith("d1", "DC1");
  });

  it("fail delega driverFailDelivery com id + motivo/observação (story 61)", async () => {
    const { client, api } = setup();
    await api.fail("d1", { reason: "customer_absent", note: "portão fechado" });
    expect(client.driverFailDelivery).toHaveBeenCalledWith("d1", {
      reason: "customer_absent",
      note: "portão fechado",
    });
  });
});
