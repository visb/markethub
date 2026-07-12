import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@markethub/api-client";
import { cancelOrderGroup, getOrderGroup, listOrders, retryDelivery } from "./orders";

/**
 * Módulo de API tipado dos pedidos do merchant (story 12/54/61). Cada função
 * delega ao ApiClient — verifica a delegação e os argumentos.
 */
function setup() {
  const api = {
    merchantOrders: vi.fn().mockResolvedValue([{ id: "g1" }]),
    merchantOrderGroup: vi.fn().mockResolvedValue({ id: "g1" }),
    merchantCancelOrderGroup: vi.fn().mockResolvedValue({ id: "g1", status: "canceled" }),
    storeDeliveryRetry: vi.fn().mockResolvedValue({ id: "d1", status: "unassigned" }),
  };
  return { api: api as unknown as ApiClient, raw: api };
}

describe("merchant orders api module", () => {
  it("listOrders delega merchantOrders com filtros", async () => {
    const { api, raw } = setup();
    await listOrders(api, { storeId: "s1", status: "on_the_way" });
    expect(raw.merchantOrders).toHaveBeenCalledWith({ storeId: "s1", status: "on_the_way" });
  });

  it("getOrderGroup delega merchantOrderGroup(id)", async () => {
    const { api, raw } = setup();
    await getOrderGroup(api, "g1");
    expect(raw.merchantOrderGroup).toHaveBeenCalledWith("g1");
  });

  it("cancelOrderGroup delega merchantCancelOrderGroup(id, reason)", async () => {
    const { api, raw } = setup();
    await cancelOrderGroup(api, "g1", "sem estoque");
    expect(raw.merchantCancelOrderGroup).toHaveBeenCalledWith("g1", "sem estoque");
  });

  it("retryDelivery delega storeDeliveryRetry(deliveryId) — story 61", async () => {
    const { api, raw } = setup();
    await retryDelivery(api, "d1");
    expect(raw.storeDeliveryRetry).toHaveBeenCalledWith("d1");
  });
});
