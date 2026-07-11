import { ExpoPushProvider } from "./expo.push-provider";
import type { PushMessage, PushTarget } from "../push-provider.interface";

/**
 * Story 50 — cobertura do provedor Expo Push com fetch mockado. Sem rede: valida
 * payload enviado a exp.host, parsing de `DeviceNotRegistered`, batching (100) e
 * tolerância a erro HTTP / exceção de rede.
 */

const MESSAGE: PushMessage = {
  title: "Pedido a caminho",
  body: "Saiu para entrega",
  data: { route: "/track/o1", orderId: "o1" },
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

describe("ExpoPushProvider", () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });

  it("expõe o nome do provedor", () => {
    expect(new ExpoPushProvider().name).toBe("expo");
  });

  it("faz POST no endpoint Expo com mensagens (to/title/body/data)", async () => {
    const fetchMock = fetchOk({ data: [{ status: "ok", id: "r1" }] });
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

    const res = await provider.send(targets("ExponentPushToken[abc]"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.method).toBe("POST");
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body).toEqual([
      {
        to: "ExponentPushToken[abc]",
        title: MESSAGE.title,
        body: MESSAGE.body,
        data: { route: "/track/o1", orderId: "o1" },
      },
    ]);
  });

  it("usa data vazio quando a mensagem não traz payload", async () => {
    const fetchMock = fetchOk({ data: [{ status: "ok" }] });
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

    await provider.send(targets("tok-1"), { title: "t", body: "b" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body[0].data).toEqual({});
  });

  it("reporta tokens DeviceNotRegistered como inválidos", async () => {
    const fetchMock = fetchOk({
      data: [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
      ],
    });
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

    const res = await provider.send(targets("ok", "gone"), MESSAGE);

    expect(res.invalidTokens).toEqual(["gone"]);
  });

  it("ignora outros erros do Expo (não marca como inválido)", async () => {
    const fetchMock = fetchOk({
      data: [{ status: "error", details: { error: "MessageTooBig" } }],
    });
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

    const res = await provider.send(targets("tok-1"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
  });

  it("tolera resposta sem data", async () => {
    const fetchMock = fetchOk({});
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

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
    const provider = new ExpoPushProvider();

    const res = await provider.send(targets("tok-1"), MESSAGE);

    expect(res.invalidTokens).toEqual([]);
  });

  it("não lança quando o fetch rejeita (erro de rede)", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

    await expect(provider.send(targets("tok-1"), MESSAGE)).resolves.toEqual({
      invalidTokens: [],
    });
  });

  it("faz batching de 100 mensagens por requisição", async () => {
    const fetchMock = fetchOk({ data: [] });
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();
    const many = targets(...Array.from({ length: 250 }, (_, i) => `t${i}`));

    await provider.send(many, MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toHaveLength(100);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toHaveLength(50);
  });

  it("retorna vazio quando não há targets (sem fetch)", async () => {
    const fetchMock = fetchOk({ data: [] });
    global.fetch = fetchMock as never;
    const provider = new ExpoPushProvider();

    const res = await provider.send([], MESSAGE);

    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
