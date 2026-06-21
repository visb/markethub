import { afterEach, describe, expect, it, vi } from "vitest";
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
});
