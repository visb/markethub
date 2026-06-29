import { FcmPushProvider } from "./fcm.push-provider";
import type { PushMessage, PushTarget } from "../push-provider.interface";

/**
 * Story 27 — cobertura do provedor FCM (HTTP legacy) com fetch mockado. Sem rede:
 * valida payload enviado, parsing de tokens inválidos, batching e tolerância a
 * erro HTTP / exceção de rede.
 */

const MESSAGE: PushMessage = {
  title: "Pedido a caminho",
  body: "Saiu para entrega",
  data: { orderId: "o1" },
};

function fetchOk(json: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(json),
  });
}

function targets(...tokens: string[]): PushTarget[] {
  return tokens.map((token) => ({ token, platform: "android" }));
}

describe("FcmPushProvider", () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });

  it("expõe o nome do provedor", () => {
    expect(new FcmPushProvider("key").name).toBe("fcm");
  });

  it("faz POST no endpoint FCM com server key, notification e data", async () => {
    const fetchMock = fetchOk({ results: [{}] });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("server-key-123");

    const res = await provider.send(targets("tok-1"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://fcm.googleapis.com/fcm/send");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("key=server-key-123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      registration_ids: ["tok-1"],
      notification: { title: MESSAGE.title, body: MESSAGE.body },
      data: { orderId: "o1" },
    });
  });

  it("usa data vazio quando a mensagem não traz payload", async () => {
    const fetchMock = fetchOk({ results: [{}] });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    await provider.send(targets("tok-1"), { title: "t", body: "b" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.data).toEqual({});
  });

  it("reporta tokens NotRegistered e InvalidRegistration como inválidos", async () => {
    const fetchMock = fetchOk({
      results: [{}, { error: "NotRegistered" }, { error: "InvalidRegistration" }],
    });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    const res = await provider.send(targets("ok", "gone", "bad"), MESSAGE);

    expect(res.invalidTokens).toEqual(["gone", "bad"]);
  });

  it("ignora outros erros do FCM (não marca como inválido)", async () => {
    const fetchMock = fetchOk({ results: [{ error: "Unavailable" }] });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    const res = await provider.send(targets("tok-1"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
  });

  it("tolera resposta sem results", async () => {
    const fetchMock = fetchOk({});
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    const res = await provider.send(targets("tok-1"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
  });

  it("continua sem invalidar tokens quando o HTTP não é ok", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    const res = await provider.send(targets("tok-1"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
  });

  it("não lança quando o fetch rejeita (erro de rede)", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    await expect(provider.send(targets("tok-1"), MESSAGE)).resolves.toEqual({
      invalidTokens: [],
    });
  });

  it("faz batching de 1000 tokens por requisição", async () => {
    const fetchMock = fetchOk({ results: [] });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");
    const many = targets(...Array.from({ length: 1500 }, (_, i) => `t${i}`));

    await provider.send(many, MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).registration_ids).toHaveLength(1000);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).registration_ids).toHaveLength(500);
  });

  it("retorna vazio quando não há targets (sem fetch)", async () => {
    const fetchMock = fetchOk({ results: [] });
    global.fetch = fetchMock as never;
    const provider = new FcmPushProvider("key");

    const res = await provider.send([], MESSAGE);

    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
