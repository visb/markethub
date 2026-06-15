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

describe("createRealtimeClient", () => {
  it("ainda é stub: lança até a Fase 5", () => {
    expect(() => createRealtimeClient({ url: "x", getToken: () => null })).toThrow(/not implemented/);
  });
});
