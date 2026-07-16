import type { ApiClient, PickItemActionInput } from "@markethub/api-client";
import { picking } from "../api/picking";

/**
 * Story 42: módulo de API tipado do separador (src/api/picking.ts). Cada método
 * apenas delega ao ApiClient injetado (CLAUDE.md: toda chamada HTTP entra aqui).
 * Verifica a delegação + o mapeamento da busca de ofertas (query string + unwrap
 * de `{ items }`). Sem rede — ApiClient é um fake controlável.
 */
function setup() {
  const client = {
    pickStores: jest.fn().mockResolvedValue([{ id: "s1", name: "Loja 1", merchantId: "m1" }]),
    pickQueue: jest.fn().mockResolvedValue([{ id: "t1" }]),
    pickAssign: jest.fn().mockResolvedValue({ id: "t1", status: "assigned" }),
    pickTask: jest.fn().mockResolvedValue({ id: "t1" }),
    pickStart: jest.fn().mockResolvedValue({ id: "t1", status: "picking" }),
    pickUpdateItem: jest.fn().mockResolvedValue({}),
    pickSubstitute: jest.fn().mockResolvedValue({}),
    pickCompletePicking: jest.fn().mockResolvedValue({ id: "t1", status: "packed" }),
    pickReady: jest.fn().mockResolvedValue({ id: "t1", status: "ready_for_pickup" }),
    pickerMetrics: jest.fn().mockResolvedValue({ period: "7d", tasksCompleted: 2 }),
    storeHandover: jest.fn().mockResolvedValue({}),
    request: jest.fn().mockResolvedValue({ items: [{ offerId: "o1", name: "Arroz", priceCents: 100, promoPriceCents: null }] }),
  };
  const api = picking(client as unknown as ApiClient);
  return { client, api };
}

describe("picking api module", () => {
  it("stores delega pickStores", async () => {
    const { client, api } = setup();
    await expect(api.stores()).resolves.toEqual([{ id: "s1", name: "Loja 1", merchantId: "m1" }]);
    expect(client.pickStores).toHaveBeenCalledTimes(1);
  });

  it("queue delega pickQueue com o storeId", async () => {
    const { client, api } = setup();
    await api.queue("s1");
    expect(client.pickQueue).toHaveBeenCalledWith("s1");
  });

  it("assign delega pickAssign com o taskId", async () => {
    const { client, api } = setup();
    await api.assign("t1");
    expect(client.pickAssign).toHaveBeenCalledWith("t1");
  });

  it("task delega pickTask com o id", async () => {
    const { client, api } = setup();
    await api.task("t1");
    expect(client.pickTask).toHaveBeenCalledWith("t1");
  });

  it("start delega pickStart com o id", async () => {
    const { client, api } = setup();
    await api.start("t1");
    expect(client.pickStart).toHaveBeenCalledWith("t1");
  });

  it("updateItem delega pickUpdateItem com id, itemId e input", async () => {
    const { client, api } = setup();
    const input: PickItemActionInput = { action: "pick", quantityPicked: 2 };
    await api.updateItem("t1", "i1", input);
    expect(client.pickUpdateItem).toHaveBeenCalledWith("t1", "i1", input);
  });

  it("substitute delega pickSubstitute com id, itemId e offerId", async () => {
    const { client, api } = setup();
    await api.substitute("t1", "i1", "o9");
    expect(client.pickSubstitute).toHaveBeenCalledWith("t1", "i1", "o9");
  });

  it("completePicking delega pickCompletePicking com o id", async () => {
    const { client, api } = setup();
    await api.completePicking("t1");
    expect(client.pickCompletePicking).toHaveBeenCalledWith("t1");
  });

  it("ready delega pickReady com o id", async () => {
    const { client, api } = setup();
    await api.ready("t1");
    expect(client.pickReady).toHaveBeenCalledWith("t1");
  });

  it("metrics delega pickerMetrics com o período (story 65)", async () => {
    const { client, api } = setup();
    await expect(api.metrics("7d")).resolves.toEqual({ period: "7d", tasksCompleted: 2 });
    expect(client.pickerMetrics).toHaveBeenCalledWith("7d");
  });

  it("storeHandover delega com orderGroupId + código", async () => {
    const { client, api } = setup();
    await api.storeHandover("g1", "1234");
    expect(client.storeHandover).toHaveBeenCalledWith("g1", "1234");
  });

  it("searchOffers monta a query string (storeId + q encoded) e desempacota items", async () => {
    const { client, api } = setup();
    const r = await api.searchOffers("s 1", "arroz & cia");
    expect(client.request).toHaveBeenCalledWith("/search?storeId=s%201&q=arroz%20%26%20cia");
    expect(r).toEqual([{ offerId: "o1", name: "Arroz", priceCents: 100, promoPriceCents: null }]);
  });
});
