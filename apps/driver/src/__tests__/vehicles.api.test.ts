import type { ApiClient } from "@markethub/api-client";
import { vehicles } from "../api/vehicles";

/**
 * Story 15: módulo de API tipado da seleção de veículo (src/api/vehicles.ts).
 * Cada método apenas delega ao ApiClient injetado — verifica a delegação.
 */
function setup() {
  const client = {
    driverVehicles: jest.fn().mockResolvedValue([{ id: "v1" }]),
    driverCurrentVehicle: jest.fn().mockResolvedValue({ id: "v1" }),
    driverSelectVehicle: jest.fn().mockResolvedValue({ id: "v1" }),
  };
  const api = vehicles(client as unknown as ApiClient);
  return { client, api };
}

describe("driver vehicles api module", () => {
  it("list delega driverVehicles", async () => {
    const { client, api } = setup();
    await expect(api.list()).resolves.toEqual([{ id: "v1" }]);
    expect(client.driverVehicles).toHaveBeenCalledTimes(1);
  });

  it("current delega driverCurrentVehicle", async () => {
    const { client, api } = setup();
    await api.current();
    expect(client.driverCurrentVehicle).toHaveBeenCalledTimes(1);
  });

  it("select delega driverSelectVehicle com o vehicleId", async () => {
    const { client, api } = setup();
    await api.select("v1");
    expect(client.driverSelectVehicle).toHaveBeenCalledWith("v1");
  });
});
