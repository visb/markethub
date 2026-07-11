import { DeliveryGateway, type DeliveryLocationPayload } from "./delivery.gateway";

/**
 * Story 51: gateway /delivery do rastreio ao vivo. subscribe:order autoriza o
 * DONO do pedido (ou admin); terceiros negados. publishLocation faz fan-out na
 * sala order:<id> e guarda a última posição em cache p/ quem entra atrasado.
 */

function makeGateway(opts: { order?: { userId: string } | null } = {}) {
  const findUnique = jest.fn().mockResolvedValue(opts.order ?? null);
  const prisma = { order: { findUnique } } as never;
  const gateway = new DeliveryGateway({} as never, {} as never, prisma);
  return { gateway, findUnique };
}

function clientWith(roles: string[], userId = "u1") {
  const emitted: { event: string; payload: unknown }[] = [];
  return {
    data: { user: { id: userId, roles } },
    join: jest.fn(),
    emit: jest.fn((event: string, payload: unknown) => emitted.push({ event, payload })),
    emitted,
  };
}

const payload: DeliveryLocationPayload = {
  deliveryId: "d1",
  orderId: "o1",
  lat: -23.5,
  lng: -46.6,
  heading: 90,
  recordedAt: "2026-07-11T12:00:00.000Z",
};

describe("DeliveryGateway.subscribeOrder — autorização", () => {
  it("dono do pedido: autoriza e entra na sala order:<id>", async () => {
    const { gateway } = makeGateway({ order: { userId: "u1" } });
    const client = clientWith(["customer"], "u1");
    const res = await gateway.subscribeOrder(client as never, { orderId: "o1" });
    expect(res).toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith("order:o1");
  });

  it("admin: autoriza sem checar dono", async () => {
    const { gateway, findUnique } = makeGateway();
    const client = clientWith(["admin"], "adm");
    const res = await gateway.subscribeOrder(client as never, { orderId: "o1" });
    expect(res).toEqual({ ok: true });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("terceiro (não dono): nega FORBIDDEN e não entra na sala", async () => {
    const { gateway } = makeGateway({ order: { userId: "outro" } });
    const client = clientWith(["customer"], "u1");
    const res = await gateway.subscribeOrder(client as never, { orderId: "o1" });
    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("pedido inexistente: nega FORBIDDEN", async () => {
    const { gateway } = makeGateway({ order: null });
    const client = clientWith(["customer"], "u1");
    const res = await gateway.subscribeOrder(client as never, { orderId: "o1" });
    expect(res).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("sem orderId no corpo: BAD_REQUEST", async () => {
    const { gateway } = makeGateway();
    const client = clientWith(["customer"], "u1");
    const res = await gateway.subscribeOrder(client as never, {} as never);
    expect(res).toEqual({ ok: false, code: "BAD_REQUEST" });
  });

  it("cliente sem usuário no handshake: BAD_REQUEST", async () => {
    const { gateway } = makeGateway();
    const client = { data: {}, join: jest.fn(), emit: jest.fn() };
    const res = await gateway.subscribeOrder(client as never, { orderId: "o1" });
    expect(res).toEqual({ ok: false, code: "BAD_REQUEST" });
  });

  it("emite a última posição em cache (fresca) ao entrar na sala", async () => {
    const { gateway } = makeGateway({ order: { userId: "u1" } });
    const server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
    (gateway as unknown as { server: unknown }).server = server;
    gateway.publishLocation("o1", payload); // popula o cache
    const client = clientWith(["customer"], "u1");
    await gateway.subscribeOrder(client as never, { orderId: "o1" });
    const last = client.emitted.at(-1);
    expect(last?.event).toBe("driver:location");
    expect(last?.payload).toMatchObject({ v: 1, orderId: "o1", lat: -23.5 });
  });

  it("não emite posição em cache quando expirada (TTL)", async () => {
    jest.useFakeTimers();
    try {
      const { gateway } = makeGateway({ order: { userId: "u1" } });
      const server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
      (gateway as unknown as { server: unknown }).server = server;
      gateway.publishLocation("o1", payload);
      jest.advanceTimersByTime(61_000); // > LOCATION_TTL_MS
      const client = clientWith(["customer"], "u1");
      await gateway.subscribeOrder(client as never, { orderId: "o1" });
      expect(client.emit).not.toHaveBeenCalledWith("driver:location", expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("DeliveryGateway.publishLocation — fan-out", () => {
  it("emite driver:location versionado na sala do pedido", () => {
    const { gateway } = makeGateway();
    const emit = jest.fn();
    const server = { to: jest.fn().mockReturnValue({ emit }) };
    (gateway as unknown as { server: unknown }).server = server;
    gateway.publishLocation("o1", payload);
    expect(server.to).toHaveBeenCalledWith("order:o1");
    expect(emit).toHaveBeenCalledWith("driver:location", { v: 1, ...payload });
  });
});

describe("DeliveryGateway.handleConnection — auth no handshake", () => {
  it("token válido: popula client.data.user", async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "u1", roles: ["customer"] }) };
    const config = { get: jest.fn().mockReturnValue("secret") };
    const gateway = new DeliveryGateway(jwt as never, config as never, {} as never);
    const client = {
      handshake: { auth: { token: "jwt" }, headers: {} },
      data: {} as Record<string, unknown>,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client as never);
    expect(client.data.user).toEqual({ id: "u1", roles: ["customer"] });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("token inválido: emite error UNAUTHORIZED e desconecta", async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error("bad")) };
    const config = { get: jest.fn().mockReturnValue("secret") };
    const gateway = new DeliveryGateway(jwt as never, config as never, {} as never);
    const client = {
      handshake: { auth: { token: "jwt" }, headers: {} },
      data: {} as Record<string, unknown>,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith("error", { code: "UNAUTHORIZED" });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("token no header Authorization Bearer também é aceito", async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "u2", roles: [] }) };
    const config = { get: jest.fn().mockReturnValue("secret") };
    const gateway = new DeliveryGateway(jwt as never, config as never, {} as never);
    const client = {
      handshake: { auth: {}, headers: { authorization: "Bearer jwt" } },
      data: {} as Record<string, unknown>,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client as never);
    expect(client.data.user).toEqual({ id: "u2", roles: [] });
  });

  it("sem token: desconecta (não autentica)", async () => {
    const jwt = { verifyAsync: jest.fn() };
    const config = { get: jest.fn().mockReturnValue("secret") };
    const gateway = new DeliveryGateway(jwt as never, config as never, {} as never);
    const client = {
      handshake: { auth: {}, headers: {} },
      data: {} as Record<string, unknown>,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client as never);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
