import { PushService } from "./push.service";
import type { PushMessage, PushSendResult, PushTarget } from "./push-provider.interface";

/**
 * Story 27 — cobertura de push de notificação (S5.6). Best-effort: registro de
 * token, envio multi-device, remoção de tokens inválidos reportados pelo provedor
 * e tolerância a falha (não quebra o fluxo de negócio).
 */

function makeProvider(result: PushSendResult = { invalidTokens: [] }) {
  const send = jest.fn<Promise<PushSendResult>, [PushTarget[], PushMessage]>(
    () => Promise.resolve(result),
  );
  return { name: "mock", send } as const;
}

function makePrisma(tokens: { token: string; platform: string }[] = []) {
  return {
    deviceToken: {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(tokens),
    },
  };
}

const MESSAGE: PushMessage = {
  title: "Pedido a caminho",
  body: "Seu pedido saiu para entrega",
  data: { orderId: "o1" },
};

describe("PushService", () => {
  describe("registerToken", () => {
    it("faz upsert do token por usuário e plataforma", async () => {
      const prisma = makePrisma();
      const provider = makeProvider();
      const svc = new PushService(prisma as never, provider as never);

      const res = await svc.registerToken("u1", "android" as never, "tok-1");

      expect(res).toEqual({ ok: true });
      expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
        where: { token: "tok-1" },
        create: { userId: "u1", platform: "android", token: "tok-1" },
        update: expect.objectContaining({ userId: "u1", platform: "android" }),
      });
    });
  });

  describe("removeToken", () => {
    it("remove o token (logout)", async () => {
      const prisma = makePrisma();
      const svc = new PushService(prisma as never, makeProvider() as never);

      const res = await svc.removeToken("tok-1");

      expect(res).toEqual({ ok: true });
      expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: "tok-1" } });
    });
  });

  describe("sendToUser", () => {
    it("não chama o provedor quando o usuário não tem devices", async () => {
      const prisma = makePrisma([]);
      const provider = makeProvider();
      const svc = new PushService(prisma as never, provider as never);

      await svc.sendToUser("u1", MESSAGE);

      expect(provider.send).not.toHaveBeenCalled();
      expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
    });

    it("envia para todos os devices do usuário (multi-device) com token+platform", async () => {
      const prisma = makePrisma([
        { token: "tok-1", platform: "android" },
        { token: "tok-2", platform: "ios" },
      ]);
      const provider = makeProvider();
      const svc = new PushService(prisma as never, provider as never);

      await svc.sendToUser("u1", MESSAGE);

      expect(provider.send).toHaveBeenCalledWith(
        [
          { token: "tok-1", platform: "android" },
          { token: "tok-2", platform: "ios" },
        ],
        MESSAGE,
      );
      expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
    });

    it("repassa o payload por tipo de evento ao provedor", async () => {
      const prisma = makePrisma([{ token: "tok-1", platform: "web" }]);
      const provider = makeProvider();
      const svc = new PushService(prisma as never, provider as never);

      const picking: PushMessage = {
        title: "Separação iniciada",
        body: "Seu pedido está sendo separado",
        data: { orderId: "o9", event: "picking_started" },
      };
      await svc.sendToUser("u1", picking);

      expect(provider.send).toHaveBeenCalledWith(
        [{ token: "tok-1", platform: "web" }],
        picking,
      );
    });

    it("remove os tokens reportados como inválidos pelo provedor", async () => {
      const prisma = makePrisma([
        { token: "tok-1", platform: "android" },
        { token: "tok-bad", platform: "ios" },
      ]);
      const provider = makeProvider({ invalidTokens: ["tok-bad"] });
      const svc = new PushService(prisma as never, provider as never);

      await svc.sendToUser("u1", MESSAGE);

      expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ["tok-bad"] } },
      });
    });

    it("não quebra o fluxo quando o provedor lança (best-effort)", async () => {
      const prisma = makePrisma([{ token: "tok-1", platform: "android" }]);
      const provider = makeProvider();
      provider.send.mockRejectedValueOnce(new Error("FCM indisponível"));
      const svc = new PushService(prisma as never, provider as never);

      await expect(svc.sendToUser("u1", MESSAGE)).resolves.toBeUndefined();
      expect(prisma.deviceToken.deleteMany).not.toHaveBeenCalled();
    });

    it("não quebra quando a leitura de tokens falha", async () => {
      const prisma = makePrisma();
      prisma.deviceToken.findMany.mockRejectedValueOnce(new Error("DB down"));
      const svc = new PushService(prisma as never, makeProvider() as never);

      await expect(svc.sendToUser("u1", MESSAGE)).resolves.toBeUndefined();
    });
  });
});
