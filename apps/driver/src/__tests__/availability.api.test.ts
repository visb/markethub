import type { ApiClient } from "@markethub/api-client";
import { availability } from "../api/availability";

/**
 * Story 62: módulo de API tipado do turno on/off (src/api/availability.ts).
 * Cada método apenas delega ao ApiClient injetado — verifica a delegação.
 */
function setup() {
  const client = {
    driverAvailability: jest.fn().mockResolvedValue({ available: false, availableSince: null }),
    driverSetAvailability: jest.fn().mockResolvedValue({ available: true, availableSince: "x" }),
  };
  const api = availability(client as unknown as ApiClient);
  return { client, api };
}

describe("driver availability api module", () => {
  it("get delega driverAvailability", async () => {
    const { client, api } = setup();
    await expect(api.get()).resolves.toEqual({ available: false, availableSince: null });
    expect(client.driverAvailability).toHaveBeenCalledTimes(1);
  });

  it("set delega driverSetAvailability com o flag", async () => {
    const { client, api } = setup();
    await api.set(true);
    expect(client.driverSetAvailability).toHaveBeenCalledWith(true);
  });
});
