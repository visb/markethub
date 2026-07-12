import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "./client";
import { createRealtimeClient } from "./socket";
import { MemoryTokenStore } from "./token-store";

/**
 * C28: núcleo do ApiClient — header de auth, mapeamento de erro p/ ApiClientError,
 * 204 sem corpo, e o refresh automático no 401 (retry-once + deduplicação).
 */

function jsonRes(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "STATUS",
    json: async () => body,
  } as Response;
}

function makeClient(opts: { tokens?: { accessToken: string; refreshToken: string }; onAuthError?: () => void } = {}) {
  const store = new MemoryTokenStore();
  if (opts.tokens) store.setTokens(opts.tokens);
  const client = new ApiClient({ baseUrl: "http://api.test", tokenStore: store, onAuthError: opts.onAuthError });
  return { client, store };
}

afterEach(() => vi.unstubAllGlobals());

describe("ApiClient.request", () => {
  it("monta a URL com prefixo e devolve o JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const out = await client.request("/health", { auth: false });
    expect(out).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/health", expect.objectContaining({ method: "GET" }));
  });

  it("inclui Authorization quando auth=true e há access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient({ tokens: { accessToken: "acc", refreshToken: "ref" } });

    await client.request("/auth/me", { auth: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer acc");
  });

  it("204 resolve para undefined sem parsear corpo", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 204, ok: true, json: async () => { throw new Error("no body"); } });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    await expect(client.request("/x", { auth: false })).resolves.toBeUndefined();
  });

  it("erro 4xx vira ApiClientError com status e body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(400, { code: "BAD", message: "ruim" }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const err = await client.request("/x", { auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(400);
    expect(err.body).toEqual({ code: "BAD", message: "ruim" });
  });

  it("erro sem JSON cai em code UNKNOWN", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      ok: false,
      statusText: "Server Error",
      json: async () => { throw new Error("not json"); },
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    const err = await client.request("/x", { auth: false }).catch((e) => e);
    expect(err.body).toEqual({ code: "UNKNOWN", message: "Server Error" });
  });

  it("401 dispara refresh e refaz a chamada com o novo token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, { code: "UNAUTH", message: "x" })) // chamada original
      .mockResolvedValueOnce(jsonRes(200, { accessToken: "new", refreshToken: "newR" })) // refresh
      .mockResolvedValueOnce(jsonRes(200, { ok: true })); // retry
    vi.stubGlobal("fetch", fetchMock);
    const { client, store } = makeClient({ tokens: { accessToken: "old", refreshToken: "ref" } });

    const out = await client.request("/auth/me", { auth: true });
    expect(out).toEqual({ ok: true });
    expect(store.getAccess()).toBe("new");
    // 3ª chamada (retry) usa o token novo
    expect(fetchMock.mock.calls[2]![1].headers.Authorization).toBe("Bearer new");
  });

  it("refresh que falha chama onAuthError e propaga o erro", async () => {
    const onAuthError = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, { code: "UNAUTH", message: "x" }))
      .mockResolvedValueOnce(jsonRes(401, { code: "UNAUTH", message: "refresh fail" }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient({ tokens: { accessToken: "old", refreshToken: "ref" }, onAuthError });

    await expect(client.request("/auth/me", { auth: true })).rejects.toBeInstanceOf(ApiClientError);
    expect(onAuthError).toHaveBeenCalled();
  });

  it("dedup: dois 401 concorrentes disparam um único refresh", async () => {
    const fetchMock = vi.fn((urlPath: string) => {
      const url = String(urlPath);
      if (url.endsWith("/auth/refresh")) return Promise.resolve(jsonRes(200, { accessToken: "new", refreshToken: "newR" }));
      // antes do refresh: 401; depois: ok. Usa o token enviado no header? simplifica por contagem.
      return Promise.resolve(jsonRes(200, { ok: true }));
    });
    // primeiras duas respostas 401 (chamadas originais), refresh, depois ok
    const seq = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, { code: "U", message: "x" }))
      .mockResolvedValueOnce(jsonRes(401, { code: "U", message: "x" }))
      .mockResolvedValueOnce(jsonRes(200, { accessToken: "new", refreshToken: "newR" }))
      .mockResolvedValue(jsonRes(200, { ok: true }));
    void fetchMock;
    vi.stubGlobal("fetch", seq);
    const { client } = makeClient({ tokens: { accessToken: "old", refreshToken: "ref" } });

    const [a, b] = await Promise.all([
      client.request("/a", { auth: true }),
      client.request("/b", { auth: true }),
    ]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    const refreshCalls = seq.mock.calls.filter((c) => String(c[0]).endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });
});

// ── Endpoints de frota / veículo (stories 14 e 15) ──
describe("ApiClient — frota merchant + veículo do entregador", () => {
  function withFetch() {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient({ tokens: { accessToken: "acc", refreshToken: "ref" } });
    return { client, fetchMock };
  }
  const url = (fetchMock: ReturnType<typeof vi.fn>, i = 0) => String(fetchMock.mock.calls[i][0]);
  const init = (fetchMock: ReturnType<typeof vi.fn>, i = 0) => fetchMock.mock.calls[i][1];

  it("merchantVehicles: GET sem/com merchantId (querystring encodada)", async () => {
    const { client, fetchMock } = withFetch();
    await client.merchantVehicles();
    expect(url(fetchMock)).toBe("http://api.test/api/v1/merchant/vehicles");
    await client.merchantVehicles("mer 1");
    expect(url(fetchMock, 1)).toBe("http://api.test/api/v1/merchant/vehicles?merchantId=mer%201");
  });

  it("merchantCreateVehicle: POST com body", async () => {
    const { client, fetchMock } = withFetch();
    await client.merchantCreateVehicle({ plate: "ABC1D23", type: "car" });
    expect(url(fetchMock)).toBe("http://api.test/api/v1/merchant/vehicles");
    expect(init(fetchMock).method).toBe("POST");
    expect(JSON.parse(init(fetchMock).body)).toEqual({ plate: "ABC1D23", type: "car" });
  });

  it("merchantUpdateVehicle: PATCH no id", async () => {
    const { client, fetchMock } = withFetch();
    await client.merchantUpdateVehicle("v1", { active: false });
    expect(url(fetchMock)).toBe("http://api.test/api/v1/merchant/vehicles/v1");
    expect(init(fetchMock).method).toBe("PATCH");
  });

  it("merchantRemoveVehicle: DELETE soft x hard", async () => {
    const { client, fetchMock } = withFetch();
    await client.merchantRemoveVehicle("v1");
    expect(url(fetchMock)).toBe("http://api.test/api/v1/merchant/vehicles/v1");
    await client.merchantRemoveVehicle("v1", true);
    expect(url(fetchMock, 1)).toBe("http://api.test/api/v1/merchant/vehicles/v1?hard=true");
    expect(init(fetchMock, 1).method).toBe("DELETE");
  });

  it("driverVehicles / driverCurrentVehicle: GET nas rotas do entregador", async () => {
    const { client, fetchMock } = withFetch();
    await client.driverVehicles();
    expect(url(fetchMock)).toBe("http://api.test/api/v1/driver/vehicles");
    await client.driverCurrentVehicle();
    expect(url(fetchMock, 1)).toBe("http://api.test/api/v1/driver/vehicle/current");
  });

  it("merchantOrderGroup: GET no detalhe do sub-pedido (story 54)", async () => {
    const { client, fetchMock } = withFetch();
    await client.merchantOrderGroup("g1");
    expect(url(fetchMock)).toBe("http://api.test/api/v1/merchant/orders/groups/g1");
  });

  it("merchantCancelOrderGroup: POST com/sem motivo (story 54)", async () => {
    const { client, fetchMock } = withFetch();
    await client.merchantCancelOrderGroup("g1", "sem estoque");
    expect(url(fetchMock)).toBe("http://api.test/api/v1/merchant/orders/groups/g1/cancel");
    expect(init(fetchMock).method).toBe("POST");
    expect(JSON.parse(init(fetchMock).body)).toEqual({ reason: "sem estoque" });
    await client.merchantCancelOrderGroup("g1");
    expect(JSON.parse(init(fetchMock, 1).body)).toEqual({});
  });

  it("driverSelectVehicle: PUT /driver/vehicle com o vehicleId", async () => {
    const { client, fetchMock } = withFetch();
    await client.driverSelectVehicle("v1");
    expect(url(fetchMock)).toBe("http://api.test/api/v1/driver/vehicle");
    expect(init(fetchMock).method).toBe("PUT");
    expect(JSON.parse(init(fetchMock).body)).toEqual({ vehicleId: "v1" });
  });

  it("driverEarnings: GET /driver/earnings com o período (default today)", async () => {
    const { client, fetchMock } = withFetch();
    await client.driverEarnings();
    expect(url(fetchMock)).toBe("http://api.test/api/v1/driver/earnings?period=today");
    await client.driverEarnings("30d");
    expect(url(fetchMock, 1)).toBe("http://api.test/api/v1/driver/earnings?period=30d");
  });

  it("driverDeliveryHistory: GET /driver/deliveries/history com a página (default 1)", async () => {
    const { client, fetchMock } = withFetch();
    await client.driverDeliveryHistory();
    expect(url(fetchMock)).toBe("http://api.test/api/v1/driver/deliveries/history?page=1");
    await client.driverDeliveryHistory(3);
    expect(url(fetchMock, 1)).toBe("http://api.test/api/v1/driver/deliveries/history?page=3");
  });

  it("driverAvailability: GET /driver/availability (story 62)", async () => {
    const { client, fetchMock } = withFetch();
    await client.driverAvailability();
    expect(url(fetchMock)).toBe("http://api.test/api/v1/driver/availability");
    expect(init(fetchMock).method ?? "GET").toBe("GET");
  });

  it("driverSetAvailability: POST /driver/availability com o flag (story 62)", async () => {
    const { client, fetchMock } = withFetch();
    await client.driverSetAvailability(true);
    expect(url(fetchMock)).toBe("http://api.test/api/v1/driver/availability");
    expect(init(fetchMock).method).toBe("POST");
    expect(JSON.parse(init(fetchMock).body)).toEqual({ available: true });
    await client.driverSetAvailability(false);
    expect(JSON.parse(init(fetchMock, 1).body)).toEqual({ available: false });
  });
});

describe("ApiClient.request — serialização e modos", () => {
  it("auth=true sem access token não envia Authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient(); // store vazio

    await client.request("/auth/me", { auth: true });
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBeUndefined();
  });

  it("serializa body com JSON.stringify e default Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    await client.request("/x", { method: "POST", body: { a: 1, b: "z" }, auth: false });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ a: 1, b: "z" });
  });

  it("sem body não envia campo body no fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    await client.request("/x", { method: "POST", auth: false });
    expect(fetchMock.mock.calls[0]![1].body).toBeUndefined();
  });

  it("normaliza prefixo customizado e baseUrl com barra final", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ApiClient({ baseUrl: "http://api.test/", prefix: "/api/v2/" });

    await client.request("/ping", { auth: false });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("http://api.test/api/v2/ping");
  });

  it("401 sem auth não dispara refresh (propaga o erro)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(401, { code: "UNAUTH", message: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient();

    await expect(client.request("/x", { auth: false })).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem chamada de refresh
  });

  it("refresh sem refresh token armazenado falha sem chamar /auth/refresh", async () => {
    const onAuthError = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(401, { code: "UNAUTH", message: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    // auth=true porém store sem refresh: define só o access
    const store = new MemoryTokenStore();
    store.setTokens({ accessToken: "acc", refreshToken: "" });
    const client = new ApiClient({ baseUrl: "http://api.test", tokenStore: store, onAuthError });

    await expect(client.request("/auth/me", { auth: true })).rejects.toBeInstanceOf(ApiClientError);
    expect(onAuthError).toHaveBeenCalled();
    // só a chamada original (refresh abortou por não ter refreshToken)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refresh com !res.ok limpa os tokens", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, { code: "U", message: "x" }))
      .mockResolvedValueOnce(jsonRes(500, { code: "ERR", message: "boom" }));
    vi.stubGlobal("fetch", fetchMock);
    const { client, store } = makeClient({ tokens: { accessToken: "old", refreshToken: "ref" } });

    await expect(client.request("/auth/me", { auth: true })).rejects.toBeInstanceOf(ApiClientError);
    expect(store.getAccess()).toBeNull();
    expect(store.getRefresh()).toBeNull();
  });

  it("refresh que lança exceção (fetch rejeita) retorna false", async () => {
    const onAuthError = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes(401, { code: "U", message: "x" }))
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const { client } = makeClient({ tokens: { accessToken: "old", refreshToken: "ref" }, onAuthError });

    await expect(client.request("/auth/me", { auth: true })).rejects.toBeInstanceOf(ApiClientError);
    expect(onAuthError).toHaveBeenCalled();
  });
});

describe("ApiClient — auth", () => {
  function withFetch(res: unknown = { accessToken: "a", refreshToken: "r" }) {
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(200, res));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const url = (m: ReturnType<typeof vi.fn>, i = 0) => String(m.mock.calls[i]![0]);
  const init = (m: ReturnType<typeof vi.fn>, i = 0) => m.mock.calls[i]![1];

  it("register persiste os tokens devolvidos", async () => {
    const fetchMock = withFetch({ accessToken: "ra", refreshToken: "rr" });
    const { client, store } = makeClient();
    const tokens = await client.register({ email: "a@b.com", password: "x", name: "N" } as never);
    expect(url(fetchMock)).toBe("http://api.test/api/v1/auth/register");
    expect(init(fetchMock).method).toBe("POST");
    expect(tokens).toEqual({ accessToken: "ra", refreshToken: "rr" });
    expect(store.getAccess()).toBe("ra");
  });

  it("login persiste os tokens devolvidos", async () => {
    const fetchMock = withFetch({ accessToken: "la", refreshToken: "lr" });
    const { client, store } = makeClient();
    await client.login({ email: "a@b.com", password: "x" } as never);
    expect(url(fetchMock)).toBe("http://api.test/api/v1/auth/login");
    expect(store.getRefresh()).toBe("lr");
  });

  it("logout com refresh token: posta logout e limpa o store", async () => {
    const fetchMock = withFetch({});
    const { client, store } = makeClient({ tokens: { accessToken: "a", refreshToken: "r" } });
    await client.logout();
    expect(url(fetchMock)).toBe("http://api.test/api/v1/auth/logout");
    expect(JSON.parse(init(fetchMock).body)).toEqual({ refreshToken: "r" });
    expect(store.getAccess()).toBeNull();
  });

  it("logout sem refresh token: não chama a rede, só limpa", async () => {
    const fetchMock = withFetch({});
    const { client } = makeClient(); // store vazio
    await client.logout();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logout ignora erro da chamada de logout (catch)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("net"));
    vi.stubGlobal("fetch", fetchMock);
    const { client, store } = makeClient({ tokens: { accessToken: "a", refreshToken: "r" } });
    await expect(client.logout()).resolves.toBeUndefined();
    expect(store.getRefresh()).toBeNull();
  });

  it("me e health usam as rotas corretas", async () => {
    const fetchMock = withFetch({});
    const { client } = makeClient({ tokens: { accessToken: "a", refreshToken: "r" } });
    await client.me();
    await client.health();
    expect(url(fetchMock, 0)).toBe("http://api.test/api/v1/auth/me");
    expect(init(fetchMock, 0).headers.Authorization).toBe("Bearer a");
    expect(url(fetchMock, 1)).toBe("http://api.test/api/v1/health");
    expect(init(fetchMock, 1).headers.Authorization).toBeUndefined(); // health é público
  });
});

// Helper de asserção de rota p/ os blocos de endpoints abaixo.
describe("ApiClient — endpoints (rota + método + body)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: ApiClient;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonRes(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    client = makeClient({ tokens: { accessToken: "acc", refreshToken: "ref" } }).client;
  });
  const call = (i = 0) => fetchMock.mock.calls[i]!;
  const url = (i = 0) => String(call(i)[0]);
  const init = (i = 0) => call(i)[1] as { method?: string; body?: string; headers: Record<string, string> };
  const B = "http://api.test/api/v1";

  it("picking: rotas e ações", async () => {
    await client.pickStores();
    expect(url(0)).toBe(`${B}/pick-tasks/stores`);
    await client.pickQueue("st 1");
    expect(url(1)).toBe(`${B}/pick-tasks?storeId=st%201`);
    await client.pickTask("t1");
    expect(url(2)).toBe(`${B}/pick-tasks/t1`);
    await client.pickAssign("t1");
    expect(url(3)).toBe(`${B}/pick-tasks/t1/assign`);
    expect(init(3).method).toBe("POST");
    await client.pickRelease("t1");
    expect(url(4)).toBe(`${B}/pick-tasks/t1/release`);
    await client.pickStart("t1");
    expect(url(5)).toBe(`${B}/pick-tasks/t1/start`);
    await client.pickCompletePicking("t1");
    expect(url(6)).toBe(`${B}/pick-tasks/t1/complete-picking`);
    await client.pickReady("t1");
    expect(url(7)).toBe(`${B}/pick-tasks/t1/ready`);
  });

  it("picking: item, substituição e release-pickup com body", async () => {
    await client.pickUpdateItem("t1", "i1", { action: "pick", quantityPicked: 2 });
    expect(url(0)).toBe(`${B}/pick-tasks/t1/items/i1`);
    expect(init(0).method).toBe("PATCH");
    expect(JSON.parse(init(0).body!)).toEqual({ action: "pick", quantityPicked: 2 });
    await client.pickSubstitute("t1", "i1", "off9");
    expect(url(1)).toBe(`${B}/pick-tasks/t1/items/i1/substitute`);
    expect(JSON.parse(init(1).body!)).toEqual({ substituteOfferId: "off9" });
    await client.pickReleasePickup("t1", "1234");
    expect(url(2)).toBe(`${B}/pick-tasks/t1/release-pickup`);
    expect(JSON.parse(init(2).body!)).toEqual({ pickupCode: "1234" });
  });

  it("merchant: lojas e contexto", async () => {
    await client.merchantContext();
    expect(url(0)).toBe(`${B}/merchant/context`);
    await client.merchantStores();
    expect(url(1)).toBe(`${B}/merchant/stores`);
    await client.merchantStoresDetail();
    expect(url(2)).toBe(`${B}/merchant/stores/detail`);
    await client.merchantCreateStore({ name: "Loja" } as never);
    expect(init(3).method).toBe("POST");
    expect(url(3)).toBe(`${B}/merchant/stores`);
    await client.merchantUpdateStore("s1", { active: false } as never);
    expect(url(4)).toBe(`${B}/merchant/stores/s1`);
    expect(init(4).method).toBe("PATCH");
  });

  it("merchant: pausa/retoma loja (story 57)", async () => {
    await client.merchantPauseStore("s1");
    expect(url(0)).toBe(`${B}/merchant/stores/s1/pause`);
    expect(init(0).method).toBe("POST");
    await client.merchantResumeStore("s1");
    expect(url(1)).toBe(`${B}/merchant/stores/s1/resume`);
    expect(init(1).method).toBe("POST");
  });

  it("merchant: integração ERP / api-keys / webhooks", async () => {
    await client.merchantErpConfig();
    expect(url(0)).toBe(`${B}/merchant/integration/erp`);
    await client.merchantPutErpConfig({ connectorType: "csv" } as never);
    expect(init(1).method).toBe("PUT");
    await client.merchantApiKeys();
    expect(url(2)).toBe(`${B}/merchant/integration/api-keys`);
    await client.merchantCreateApiKey("chave");
    expect(JSON.parse(init(3).body!)).toEqual({ name: "chave" });
    await client.merchantRevokeApiKey("k1");
    expect(url(4)).toBe(`${B}/merchant/integration/api-keys/k1`);
    expect(init(4).method).toBe("DELETE");
    await client.merchantWebhooks();
    expect(url(5)).toBe(`${B}/merchant/integration/webhooks`);
    await client.merchantCreateWebhook({ url: "https://x" } as never);
    expect(init(6).method).toBe("POST");
    await client.merchantUpdateWebhook("w1", { active: false } as never);
    expect(url(7)).toBe(`${B}/merchant/integration/webhooks/w1`);
    expect(init(7).method).toBe("PATCH");
    await client.merchantDeleteWebhook("w1");
    expect(init(8).method).toBe("DELETE");
    await client.merchantTestWebhook("w1");
    expect(url(9)).toBe(`${B}/merchant/integration/webhooks/w1/test`);
    expect(init(9).method).toBe("POST");
  });

  it("merchant: staff (querystring + soft/hard)", async () => {
    await client.merchantStaff();
    expect(url(0)).toBe(`${B}/merchant/staff`);
    await client.merchantStaff("st 1");
    expect(url(1)).toBe(`${B}/merchant/staff?storeId=st%201`);
    await client.merchantCreateStaff({ email: "a@b.com" } as never);
    expect(init(2).method).toBe("POST");
    await client.merchantUpdateStaff("u1", { active: true } as never);
    expect(url(3)).toBe(`${B}/merchant/staff/u1`);
    expect(init(3).method).toBe("PATCH");
    await client.merchantRemoveStaff("u1");
    expect(url(4)).toBe(`${B}/merchant/staff/u1`);
    await client.merchantRemoveStaff("u1", true);
    expect(url(5)).toBe(`${B}/merchant/staff/u1?hard=true`);
    expect(init(5).method).toBe("DELETE");
  });

  it("merchant: offers (query opcional) + update/unlock", async () => {
    await client.merchantOffers();
    expect(url(0)).toBe(`${B}/merchant/offers`);
    await client.merchantOffers({ storeId: "s1", search: "leite", categoryId: "c1", available: false });
    expect(url(1)).toBe(`${B}/merchant/offers?storeId=s1&search=leite&categoryId=c1&available=false`);
    await client.merchantUpdateOffer("o1", { priceCents: 100 });
    expect(url(2)).toBe(`${B}/merchant/offers/o1`);
    expect(init(2).method).toBe("PATCH");
    await client.merchantUnlockOffer("o1", "priceCents");
    expect(url(3)).toBe(`${B}/merchant/offers/o1/locks/priceCents`);
    expect(init(3).method).toBe("DELETE");
  });

  it("merchant: stocks (query opcional) + update/unlock", async () => {
    await client.merchantStocks();
    expect(url(0)).toBe(`${B}/merchant/stocks`);
    await client.merchantStocks("s1");
    expect(url(1)).toBe(`${B}/merchant/stocks?storeId=s1`);
    await client.merchantUpdateStock("k1", { quantity: 5 });
    expect(url(2)).toBe(`${B}/merchant/stocks/k1`);
    expect(init(2).method).toBe("PATCH");
    await client.merchantUnlockStock("k1", "quantity");
    expect(url(3)).toBe(`${B}/merchant/stocks/k1/locks/quantity`);
    expect(init(3).method).toBe("DELETE");
  });

  it("merchant: orders (query opcional)", async () => {
    await client.merchantOrders();
    expect(url(0)).toBe(`${B}/merchant/orders`);
    await client.merchantOrders({ storeId: "s1", status: "picking" });
    expect(url(1)).toBe(`${B}/merchant/orders?storeId=s1&status=picking`);
  });

  it("merchant: relatórios usam reportQuery", async () => {
    await client.merchantSalesReport();
    expect(url(0)).toBe(`${B}/merchant/reports/sales`);
    await client.merchantSalesReport({ from: "2026-01-01", to: "2026-02-01", storeId: "s1" });
    expect(url(1)).toBe(`${B}/merchant/reports/sales?from=2026-01-01&to=2026-02-01&storeId=s1`);
    await client.merchantOperationsReport({ storeId: "s1" });
    expect(url(2)).toBe(`${B}/merchant/reports/operations?storeId=s1`);
    await client.merchantTopProductsReport({ limit: 10 });
    expect(url(3)).toBe(`${B}/merchant/reports/top-products?limit=10`);
    await client.merchantReviewsReport();
    expect(url(4)).toBe(`${B}/merchant/reports/reviews`);
  });

  it("avaliações: vitrine pública + gestão + resposta (story 56)", async () => {
    await client.storeReviews("m1");
    expect(url(0)).toBe(`${B}/merchants/m1/reviews?axis=merchant&page=1`);
    expect(init(0).headers.Authorization).toBeUndefined(); // vitrine é pública
    await client.storeReviews("m 2", 3);
    expect(url(1)).toBe(`${B}/merchants/m%202/reviews?axis=merchant&page=3`);
    await client.merchantReviews();
    expect(url(2)).toBe(`${B}/merchant/reviews`);
    await client.merchantReviews({ rating: 4, unanswered: true });
    expect(url(3)).toBe(`${B}/merchant/reviews?rating=4&unanswered=true`);
    await client.merchantReplyReview("r1", "obrigado");
    expect(url(4)).toBe(`${B}/merchant/reviews/r1/reply`);
    expect(init(4).method).toBe("POST");
    expect(JSON.parse(init(4).body!)).toEqual({ text: "obrigado" });
  });

  it("merchant: upload-url + produtos", async () => {
    await client.merchantUploadUrl("a.png", "image/png");
    expect(url(0)).toBe(`${B}/merchant/products/upload-url`);
    expect(JSON.parse(init(0).body!)).toEqual({ filename: "a.png", contentType: "image/png" });
    await client.merchantCreateProduct({ name: "X" });
    expect(url(1)).toBe(`${B}/merchant/products`);
    expect(init(1).method).toBe("POST");
    await client.merchantUpdateProduct("p1", { name: "Y" });
    expect(url(2)).toBe(`${B}/merchant/products/p1`);
    expect(init(2).method).toBe("PATCH");
  });

  it("driver: stores, deliveries (query) e ações com código", async () => {
    await client.driverMyStores();
    expect(url(0)).toBe(`${B}/driver/stores`);
    await client.driverDeliveries();
    expect(url(1)).toBe(`${B}/driver/deliveries`);
    await client.driverDeliveries({ storeId: "s1", status: "out" });
    expect(url(2)).toBe(`${B}/driver/deliveries?storeId=s1&status=out`);
    await client.driverAvailableDeliveries();
    expect(url(3)).toBe(`${B}/driver/deliveries/available`);
    await client.driverAvailableDeliveries({ storeId: "s1" });
    expect(url(4)).toBe(`${B}/driver/deliveries/available?storeId=s1`);
    await client.driverAcceptDelivery("d1");
    expect(url(5)).toBe(`${B}/driver/deliveries/d1/accept`);
    expect(init(5).method).toBe("POST");
    await client.driverConfirmPickup("d1", "PC");
    expect(url(6)).toBe(`${B}/driver/deliveries/d1/pickup`);
    expect(JSON.parse(init(6).body!)).toEqual({ pickupCode: "PC" });
    await client.driverConfirmDelivery("d1", "DC");
    expect(url(7)).toBe(`${B}/driver/deliveries/d1/deliver`);
    expect(JSON.parse(init(7).body!)).toEqual({ deliveryCode: "DC" });
    // Falha na entrega (story 61): motivo + observação opcional.
    await client.driverFailDelivery("d1", { reason: "customer_absent", note: "portão fechado" });
    expect(url(8)).toBe(`${B}/driver/deliveries/d1/fail`);
    expect(init(8).method).toBe("POST");
    expect(JSON.parse(init(8).body!)).toEqual({ reason: "customer_absent", note: "portão fechado" });
    // Rastreio ao vivo (story 51): publica a posição (ingest throttled).
    await client.driverPublishLocation("d1", {
      lat: -23.5,
      lng: -46.6,
      heading: 90,
      recordedAt: "2026-07-11T12:00:00.000Z",
    });
    expect(url(9)).toBe(`${B}/driver/deliveries/d1/location`);
    expect(init(9).method).toBe("POST");
    expect(JSON.parse(init(9).body!)).toEqual({
      lat: -23.5,
      lng: -46.6,
      heading: 90,
      recordedAt: "2026-07-11T12:00:00.000Z",
    });
  });

  it("store: despacho de entregas e handover", async () => {
    await client.storeDeliveries("s1");
    expect(url(0)).toBe(`${B}/store/deliveries?storeId=s1`);
    await client.storeDeliveries("s1", "ready");
    expect(url(1)).toBe(`${B}/store/deliveries?storeId=s1&status=ready`);
    await client.storeDrivers("s 1");
    expect(url(2)).toBe(`${B}/store/drivers?storeId=s%201`);
    await client.assignDelivery("d1", "drv1");
    expect(url(3)).toBe(`${B}/store/deliveries/d1/assign`);
    expect(JSON.parse(init(3).body!)).toEqual({ driverId: "drv1" });
    await client.unassignDelivery("d1");
    expect(url(4)).toBe(`${B}/store/deliveries/d1/unassign`);
    expect(init(4).method).toBe("POST");
    // Reenvio de entrega com falha (story 61).
    await client.storeDeliveryRetry("d1");
    expect(url(5)).toBe(`${B}/store/deliveries/d1/retry`);
    expect(init(5).method).toBe("POST");
    await client.storeHandover("og1", "9999");
    expect(url(6)).toBe(`${B}/store/order-groups/og1/handover`);
    expect(JSON.parse(init(6).body!)).toEqual({ code: "9999" });
  });

  it("merchant: slots de agendamento (listar/criar/remover — story 55)", async () => {
    await client.merchantStoreSlots("st 1");
    expect(url(0)).toBe(`${B}/store/slots?storeId=st%201`);
    await client.merchantCreateSlot({
      storeId: "s1",
      start: "2026-07-01T11:00:00.000Z",
      end: "2026-07-01T12:00:00.000Z",
      capacity: 5,
    });
    expect(url(1)).toBe(`${B}/store/slots`);
    expect(init(1).method).toBe("POST");
    expect(JSON.parse(init(1).body!)).toEqual({
      storeId: "s1",
      start: "2026-07-01T11:00:00.000Z",
      end: "2026-07-01T12:00:00.000Z",
      capacity: 5,
    });
    await client.merchantDeleteSlot("slot1");
    expect(url(2)).toBe(`${B}/store/slots/slot1`);
    expect(init(2).method).toBe("DELETE");
  });

  it("notificações: registra e remove device token", async () => {
    await client.registerDeviceToken("tok", "ios");
    expect(url(0)).toBe(`${B}/notifications/device-tokens`);
    expect(init(0).method).toBe("POST");
    expect(JSON.parse(init(0).body!)).toEqual({ token: "tok", platform: "ios" });
    await client.unregisterDeviceToken("tok");
    expect(url(1)).toBe(`${B}/notifications/device-tokens`);
    expect(init(1).method).toBe("DELETE");
    expect(JSON.parse(init(1).body!)).toEqual({ token: "tok" });
  });
});

describe("MemoryTokenStore", () => {
  it("set/get/clear", () => {
    const s = new MemoryTokenStore();
    expect(s.getAccess()).toBeNull();
    s.setTokens({ accessToken: "a", refreshToken: "r" });
    expect(s.getAccess()).toBe("a");
    expect(s.getRefresh()).toBe("r");
    s.clear();
    expect(s.getRefresh()).toBeNull();
  });
});

// ── RealtimeClient (socket.io-client mockado, sem rede) ──

const ioMock = vi.hoisted(() => vi.fn());
const fakeSocket = vi.hoisted(() => ({
  on: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
}));

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => {
    ioMock(...args);
    return fakeSocket;
  },
}));

describe("createRealtimeClient", () => {
  afterEach(() => {
    ioMock.mockClear();
    fakeSocket.on.mockClear();
    fakeSocket.emit.mockClear();
    fakeSocket.connect.mockClear();
    fakeSocket.disconnect.mockClear();
    fakeSocket.connected = false;
  });

  it("conecta ao namespace /picking usando o token de getToken", async () => {
    const rt = createRealtimeClient({ url: "http://api.test", getToken: () => "jwt-123" });
    rt.connect();

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock.mock.calls[0]![0]).toBe("http://api.test/picking");
    expect(fakeSocket.connect).toHaveBeenCalled();

    // auth é uma função (resolve o token a cada (re)conexão); deve chamar getToken.
    const authFn = ioMock.mock.calls[0]![1].auth as (cb: (d: { token: string | null }) => void) => void;
    let received: { token: string | null } | undefined;
    authFn((d) => (received = d));
    await Promise.resolve();
    expect(received).toEqual({ token: "jwt-123" });
  });

  it("getToken assíncrono é resolvido para o handshake", async () => {
    const rt = createRealtimeClient({ url: "http://api.test", getToken: async () => "async-tok" });
    rt.connect();
    const authFn = ioMock.mock.calls[0]![1].auth as (cb: (d: { token: string | null }) => void) => void;
    let received: { token: string | null } | undefined;
    authFn((d) => (received = d));
    await Promise.resolve();
    await Promise.resolve();
    expect(received).toEqual({ token: "async-tok" });
  });

  it("on encaminha o handler ao socket", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    const handler = vi.fn();
    rt.connect();
    rt.on("order.updated", handler);
    expect(fakeSocket.on).toHaveBeenCalledWith("order.updated", handler);
  });

  it("dois handlers no mesmo evento são ambos registrados", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    const h1 = vi.fn();
    const h2 = vi.fn();
    rt.connect();
    rt.on("order.updated", h1);
    rt.on("order.updated", h2); // reusa o Set existente do evento
    expect(fakeSocket.on).toHaveBeenCalledWith("order.updated", h1);
    expect(fakeSocket.on).toHaveBeenCalledWith("order.updated", h2);
  });

  it("handlers registrados antes do connect são reaplicados ao conectar", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    const handler = vi.fn();
    rt.on("order.updated", handler); // antes do connect → socket ainda não existe
    rt.connect();
    expect(fakeSocket.on).toHaveBeenCalledWith("order.updated", handler);
  });

  it("subscribeOrder emite subscribe:order com o orderId", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    rt.connect();
    rt.subscribeOrder("ord_1");
    expect(fakeSocket.emit).toHaveBeenCalledWith("subscribe:order", { orderId: "ord_1" });
  });

  it("subscribeStore emite subscribe:store com o storeId", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    rt.connect();
    rt.subscribeStore("store_1");
    expect(fakeSocket.emit).toHaveBeenCalledWith("subscribe:store", { storeId: "store_1" });
  });

  it("emit encaminha evento + payload ao socket", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    rt.connect();
    rt.emit("ping", { a: 1 });
    expect(fakeSocket.emit).toHaveBeenCalledWith("ping", { a: 1 });
  });

  it("disconnect desconecta e limpa o socket", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    rt.connect();
    rt.disconnect();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
    // próximo connect cria um socket novo (io chamado de novo)
    rt.connect();
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it("connected reflete o estado do socket", () => {
    const rt = createRealtimeClient({ url: "x", getToken: () => null });
    expect(rt.connected).toBe(false);
    rt.connect();
    fakeSocket.connected = true;
    expect(rt.connected).toBe(true);
  });

  // ── Namespace parametrizado (story 51) ──

  it("sem namespace: mantém o default /picking (compat com consumidores atuais)", () => {
    const rt = createRealtimeClient({ url: "http://api.test", getToken: () => null });
    rt.connect();
    expect(ioMock.mock.calls[0]![0]).toBe("http://api.test/picking");
  });

  it("namespace /delivery: conecta ao canal do rastreio de entrega ao vivo", () => {
    const rt = createRealtimeClient({
      url: "http://api.test",
      getToken: () => null,
      namespace: "/delivery",
    });
    rt.connect();
    expect(ioMock.mock.calls[0]![0]).toBe("http://api.test/delivery");
  });
});
