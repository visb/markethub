import type { ApiClient } from "@markethub/api-client";
import { storeDeliveries } from "../api/deliveries";

/**
 * Story 61: módulo de API tipado do despacho de entregas (src/api/deliveries.ts).
 * Cada método delega ao ApiClient injetado — verifica a delegação (fila,
 * entregadores, atribuir/desatribuir, reenviar e cancelar sub-pedido).
 */
function setup() {
  const client = {
    storeDeliveries: jest.fn().mockResolvedValue([{ id: "d1" }]),
    storeDrivers: jest.fn().mockResolvedValue([{ id: "drv1" }]),
    assignDelivery: jest.fn().mockResolvedValue({ id: "d1" }),
    unassignDelivery: jest.fn().mockResolvedValue({ id: "d1" }),
    storeDeliveryRetry: jest.fn().mockResolvedValue({ id: "d1", status: "unassigned" }),
    merchantCancelOrderGroup: jest.fn().mockResolvedValue({ id: "g1", status: "canceled" }),
  };
  const api = storeDeliveries(client as unknown as ApiClient);
  return { client, api };
}

describe("picker store deliveries api module", () => {
  it("queue delega storeDeliveries(storeId)", async () => {
    const { client, api } = setup();
    await expect(api.queue("s1")).resolves.toEqual([{ id: "d1" }]);
    expect(client.storeDeliveries).toHaveBeenCalledWith("s1");
  });

  it("drivers delega storeDrivers(storeId)", async () => {
    const { client, api } = setup();
    await api.drivers("s1");
    expect(client.storeDrivers).toHaveBeenCalledWith("s1");
  });

  it("assign delega assignDelivery(id, driverId)", async () => {
    const { client, api } = setup();
    await api.assign("d1", "drv1");
    expect(client.assignDelivery).toHaveBeenCalledWith("d1", "drv1");
  });

  it("unassign delega unassignDelivery(id)", async () => {
    const { client, api } = setup();
    await api.unassign("d1");
    expect(client.unassignDelivery).toHaveBeenCalledWith("d1");
  });

  it("retry delega storeDeliveryRetry(id) — story 61", async () => {
    const { client, api } = setup();
    await api.retry("d1");
    expect(client.storeDeliveryRetry).toHaveBeenCalledWith("d1");
  });

  it("cancelGroup delega merchantCancelOrderGroup(orderGroupId) — story 54", async () => {
    const { client, api } = setup();
    await api.cancelGroup("g1");
    expect(client.merchantCancelOrderGroup).toHaveBeenCalledWith("g1");
  });
});
