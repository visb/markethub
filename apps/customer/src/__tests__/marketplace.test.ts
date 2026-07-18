import type { ApiClient } from "@markethub/api-client";
import { marketplace } from "../api/marketplace";

/**
 * C22: módulo de API tipado do customer (src/api/marketplace.ts). Verifica a
 * montagem de URL/params (geoQs, paginação, encode de busca) e os flags de
 * cada chamada. customer não tem React Query/queryKeys (desvio B21), então a
 * unidade testável é a camada de request tipada.
 */
function setup() {
  const request = jest.fn().mockResolvedValue({});
  const mkt = marketplace({ request } as unknown as ApiClient);
  return { request, mkt };
}

describe("marketplace api module", () => {
  it("feed sem geo → querystring vazia", async () => {
    const { request, mkt } = setup();
    await mkt.feed();
    expect(request).toHaveBeenCalledWith("/feed?");
  });

  it("feed com geo inclui lat/lng/radiusKm", async () => {
    const { request, mkt } = setup();
    await mkt.feed({ lat: -25.4, lng: -49.2, radiusKm: 13 });
    expect(request).toHaveBeenCalledWith("/feed?lat=-25.4&lng=-49.2&radiusKm=13");
  });

  it("geoQs omite radiusKm quando ausente", async () => {
    const { request, mkt } = setup();
    await mkt.feed({ lat: -25.4, lng: -49.2 });
    expect(request).toHaveBeenCalledWith("/feed?lat=-25.4&lng=-49.2");
  });

  it("categoryFeed monta pageSize + q + storeId", async () => {
    const { request, mkt } = setup();
    await mkt.categoryFeed("c1", { q: "arroz", storeId: "s1" });
    const url = request.mock.calls[0][0] as string;
    expect(url.startsWith("/marketplace-categories/c1/feed?")).toBe(true);
    expect(url).toContain("pageSize=50");
    expect(url).toContain("q=arroz");
    expect(url).toContain("storeId=s1");
  });

  it("products inclui página e pageSize", async () => {
    const { request, mkt } = setup();
    await mkt.products("s1", 2);
    expect(request).toHaveBeenCalledWith("/stores/s1/products?page=2&pageSize=30");
  });

  it("search faz encode do termo", async () => {
    const { request, mkt } = setup();
    await mkt.search("s1", "arroz integral");
    expect(request).toHaveBeenCalledWith("/search?storeId=s1&q=arroz%20integral");
  });

  it("searchSuggest faz encode do termo (story 80)", async () => {
    const { request, mkt } = setup();
    await mkt.searchSuggest("arroz integral");
    expect(request).toHaveBeenCalledWith("/search/suggest?q=arroz%20integral");
  });

  it("searchGlobal monta q + geo + página (story 80)", async () => {
    const { request, mkt } = setup();
    await mkt.searchGlobal("arroz", { geo: { lat: -23.5, lng: -46.6, radiusKm: 10 }, page: 2 });
    const url = request.mock.calls[0][0] as string;
    expect(url.startsWith("/search?")).toBe(true);
    expect(url).toContain("q=arroz");
    expect(url).toContain("lat=-23.5");
    expect(url).toContain("lng=-46.6");
    expect(url).toContain("radiusKm=10");
    expect(url).toContain("page=2");
    expect(url).not.toContain("storeId");
  });

  it("searchGlobal sem geo nem página envia só o termo (story 80)", async () => {
    const { request, mkt } = setup();
    await mkt.searchGlobal("arroz");
    expect(request).toHaveBeenCalledWith("/search?q=arroz");
  });

  it("addItem faz POST autenticado com body", async () => {
    const { request, mkt } = setup();
    await mkt.addItem({ offerId: "o1", quantity: 2 });
    expect(request).toHaveBeenCalledWith("/cart/items", {
      method: "POST",
      auth: true,
      body: { offerId: "o1", quantity: 2 },
    });
  });

  it("removeItem faz DELETE autenticado", async () => {
    const { request, mkt } = setup();
    await mkt.removeItem("i1");
    expect(request).toHaveBeenCalledWith("/cart/items/i1", { method: "DELETE", auth: true });
  });

  it("storesNearby monta o bbox na querystring (story 05)", async () => {
    const { request, mkt } = setup();
    await mkt.storesNearby({ north: 1, south: -1, east: 2, west: -2 });
    expect(request).toHaveBeenCalledWith("/stores/nearby?north=1&south=-1&east=2&west=-2");
  });

  it("storeSummary busca o resumo da loja (story 29)", async () => {
    const { request, mkt } = setup();
    await mkt.storeSummary("s1");
    expect(request).toHaveBeenCalledWith("/stores/s1/summary");
  });

  // Seguir loja (story 34)
  it("followedStores faz GET autenticado", async () => {
    const { request, mkt } = setup();
    await mkt.followedStores();
    expect(request).toHaveBeenCalledWith("/store-follows", { auth: true });
  });

  it("followStore faz POST autenticado com o storeId no body", async () => {
    const { request, mkt } = setup();
    await mkt.followStore("s1");
    expect(request).toHaveBeenCalledWith("/store-follows", {
      method: "POST",
      auth: true,
      body: { storeId: "s1" },
    });
  });

  it("unfollowStore faz DELETE autenticado na rota da loja", async () => {
    const { request, mkt } = setup();
    await mkt.unfollowStore("s1");
    expect(request).toHaveBeenCalledWith("/store-follows/s1", { method: "DELETE", auth: true });
  });
});
