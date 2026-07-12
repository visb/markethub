import type { ApiClient } from "@markethub/api-client";
import { earnings } from "../api/earnings";

/**
 * Story 60: módulo de API tipado dos ganhos/histórico (src/api/earnings.ts). Cada
 * método apenas delega ao ApiClient injetado — verifica a delegação e os argumentos.
 */
function setup() {
  const client = {
    driverEarnings: jest.fn().mockResolvedValue({ tipsPaidCents: 100 }),
    driverDeliveryHistory: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
  };
  const api = earnings(client as unknown as ApiClient);
  return { client, api };
}

describe("driver earnings api module", () => {
  it("summary delega driverEarnings com o período", async () => {
    const { client, api } = setup();
    await expect(api.summary("7d")).resolves.toEqual({ tipsPaidCents: 100 });
    expect(client.driverEarnings).toHaveBeenCalledWith("7d");
  });

  it("history delega driverDeliveryHistory com a página", async () => {
    const { client, api } = setup();
    await api.history(2);
    expect(client.driverDeliveryHistory).toHaveBeenCalledWith(2);
  });
});
