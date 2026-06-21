import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { apiKeyMatches, signWebhookBody } from "./integration.crypto";
import { IntegrationService } from "./integration.service";

/**
 * Story 09: configuração de integração owner-only.
 * - ERP config: PUT grava; GET mascara segredo; PATCH de valor mascarado não apaga
 *   o segredo atual; config inválido p/ o tipo → 400.
 * - Api-key: criação devolve a chave 1x e persiste só o hash; lista nunca expõe o
 *   valor; revogação invalida.
 * - Webhook: criação devolve secret 1x; assinatura HMAC confere; emit enfileira;
 *   entrega grava status e relança em falha (retry do BullMQ).
 * - owner-only: gerente/sem papel → FORBIDDEN.
 */

const owner = { id: "u1", roles: ["merchant"] };
const manager = { id: "u2", roles: ["customer"] };

function makeService(overrides: {
  staff?: { store: { merchantId: string } }[];
  merchant?: Record<string, unknown> | null;
  apiKey?: Record<string, unknown> | null;
  webhook?: Record<string, unknown> | null;
  connectorTypes?: string[];
  senderOk?: boolean;
} = {}) {
  const staff = overrides.staff ?? [{ store: { merchantId: "m1" } }];
  const merchantUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "m1", ...data }));
  const apiKeyCreate = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: "k1", createdAt: new Date(), ...data }),
  );
  const apiKeyUpdate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "k1", ...data }));
  const webhookCreate = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: "w1", createdAt: new Date(), lastDeliveryStatus: null, lastDeliveryAt: null, active: true, ...data }),
  );
  const webhookUpdate = jest.fn().mockImplementation(({ where, data }) =>
    Promise.resolve({ id: where.id, url: "https://x", secret: "whsec_x", events: [], active: true, lastDeliveryStatus: null, lastDeliveryAt: null, createdAt: new Date(), ...data }),
  );
  const webhookDelete = jest.fn().mockResolvedValue({});
  const prisma = {
    storeStaff: { findMany: jest.fn().mockResolvedValue(staff) },
    merchant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(
        overrides.merchant ?? { connectorType: null, connectorConfig: null },
      ),
      update: merchantUpdate,
    },
    apiKey: {
      findMany: jest.fn().mockResolvedValue([
        { id: "k1", name: "ERP", prefix: "mk_live_aaaaaa", keyHash: "h", createdAt: new Date(), lastUsedAt: null, revokedAt: null },
      ]),
      findUnique: jest.fn().mockResolvedValue(overrides.apiKey === undefined ? { id: "k1", merchantId: "m1", revokedAt: null } : overrides.apiKey),
      create: apiKeyCreate,
      update: apiKeyUpdate,
    },
    webhook: {
      findMany: jest.fn().mockResolvedValue([
        { id: "w1", url: "https://x", secret: "whsec_secret", events: ["order.created"], active: true, lastDeliveryStatus: "ok", lastDeliveryAt: new Date(), createdAt: new Date() },
      ]),
      findUnique: jest.fn().mockResolvedValue(
        overrides.webhook === undefined
          ? { id: "w1", merchantId: "m1", url: "https://x", secret: "whsec_secret", events: ["order.created"], active: true }
          : overrides.webhook,
      ),
      create: webhookCreate,
      update: webhookUpdate,
      delete: webhookDelete,
    },
  };
  const connectors = { list: () => overrides.connectorTypes ?? ["csv"] } as never;
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const queue = { enqueue } as never;
  const send = jest.fn().mockResolvedValue({ ok: overrides.senderOk ?? true, status: overrides.senderOk === false ? 500 : 200 });
  const sender = { send } as never;
  const svc = new IntegrationService(prisma as never, connectors, queue, sender);
  return { svc, prisma, merchantUpdate, apiKeyCreate, apiKeyUpdate, webhookCreate, webhookUpdate, webhookDelete, enqueue, send };
}

describe("IntegrationService — owner scope (story 09)", () => {
  it("gerente (sem RoleName merchant) → FORBIDDEN em qualquer rota", async () => {
    const { svc } = makeService();
    await expect(svc.getErpConfig(manager)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listApiKeys(manager)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listWebhooks(manager)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("owner sem rede → BadRequest (não resolve merchant)", async () => {
    const { svc } = makeService({ staff: [] });
    await expect(svc.getErpConfig(owner)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("IntegrationService — ERP config", () => {
  it("PUT grava connectorType + config; GET volta mascarado", async () => {
    const { svc, merchantUpdate } = makeService();
    await svc.putErpConfig(owner, { connectorType: "csv", connectorConfig: { dir: "/data", apiKey: "super-secret" } });
    const saved = merchantUpdate.mock.calls[0][0].data;
    expect(saved.connectorType).toBe("csv");
    expect(saved.connectorConfig.apiKey).toBe("super-secret"); // persistido em claro
  });

  it("GET mascara segredos do config (nunca devolve valor)", async () => {
    const { svc } = makeService({ merchant: { connectorType: "csv", connectorConfig: { dir: "/data", apiKey: "super-secret" } } });
    const res = await svc.getErpConfig(owner);
    expect(res.connectorConfig.dir).toBe("/data");
    expect(res.connectorConfig.apiKey).toBe("****cret");
  });

  it("PATCH com valor mascarado NÃO apaga o segredo atual", async () => {
    const { svc, merchantUpdate } = makeService({ merchant: { connectorType: "csv", connectorConfig: { dir: "/data", apiKey: "super-secret" } } });
    // front reenviou o mascarado → mantém o segredo
    await svc.putErpConfig(owner, { connectorType: "csv", connectorConfig: { dir: "/novo", apiKey: "****cret" } });
    const saved = merchantUpdate.mock.calls[0][0].data;
    expect(saved.connectorConfig.apiKey).toBe("super-secret");
    expect(saved.connectorConfig.dir).toBe("/novo");
  });

  it("config inválido p/ o tipo → BadRequest", async () => {
    const { svc } = makeService();
    await expect(
      svc.putErpConfig(owner, { connectorType: "csv", connectorConfig: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("conector desconhecido → BadRequest", async () => {
    const { svc } = makeService();
    await expect(
      svc.putErpConfig(owner, { connectorType: "bling", connectorConfig: { dir: "/x" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("IntegrationService — api-keys", () => {
  it("criação devolve a chave 1x e persiste só o hash", async () => {
    const { svc, apiKeyCreate } = makeService();
    const res = await svc.createApiKey(owner, "ERP");
    expect(res.key).toMatch(/^mk_live_/);
    const saved = apiKeyCreate.mock.calls[0][0].data;
    expect(saved.keyHash).toBeDefined();
    expect(saved).not.toHaveProperty("key");
    // hash corresponde à chave revelada
    expect(apiKeyMatches(res.key, saved.keyHash)).toBe(true);
  });

  it("nome vazio → BadRequest", async () => {
    const { svc } = makeService();
    await expect(svc.createApiKey(owner, "  ")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lista nunca expõe o valor/hash", async () => {
    const { svc } = makeService();
    const list = await svc.listApiKeys(owner);
    expect(list[0]).not.toHaveProperty("keyHash");
    expect(list[0]).not.toHaveProperty("key");
    expect(list[0].prefix).toBe("mk_live_aaaaaa");
  });

  it("revogação marca revokedAt", async () => {
    const { svc, apiKeyUpdate } = makeService();
    const res = await svc.revokeApiKey(owner, "k1");
    expect(apiKeyUpdate).toHaveBeenCalled();
    expect(res.revokedAt).toBeInstanceOf(Date);
  });

  it("revoga api-key de outra rede → NotFound", async () => {
    const { svc } = makeService({ apiKey: { id: "k1", merchantId: "OTHER", revokedAt: null } });
    await expect(svc.revokeApiKey(owner, "k1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("IntegrationService — webhooks", () => {
  it("criação devolve o secret 1x; lista mascara o secret", async () => {
    const { svc, webhookCreate } = makeService();
    const res = await svc.createWebhook(owner, { url: "https://merchant.example/wh" });
    expect(res.secret).toMatch(/^whsec_/);
    const saved = webhookCreate.mock.calls[0][0].data;
    expect(saved.events).toEqual(["order.created", "order.status_changed"]); // default
    const list = await svc.listWebhooks(owner);
    expect(list[0]).not.toHaveProperty("secret");
    expect(list[0].secretMasked).toMatch(/^\*\*\*\*/);
  });

  it("URL inválida → BadRequest", async () => {
    const { svc } = makeService();
    await expect(svc.createWebhook(owner, { url: "ftp://x" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createWebhook(owner, { url: "nada" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("evento não suportado → BadRequest", async () => {
    const { svc } = makeService();
    await expect(
      svc.createWebhook(owner, { url: "https://x.example", events: ["payment.refunded"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("testar webhook enfileira ping", async () => {
    const { svc, enqueue } = makeService();
    await svc.testWebhook(owner, "w1");
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ webhookId: "w1", event: "ping" }));
  });

  it("deletar webhook de outra rede → NotFound", async () => {
    const { svc } = makeService({ webhook: { id: "w1", merchantId: "OTHER" } });
    await expect(svc.deleteWebhook(owner, "w1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("IntegrationService — emit + entrega", () => {
  it("emit enfileira só p/ webhooks ativos inscritos no evento", async () => {
    const { svc, prisma, enqueue } = makeService();
    (prisma.webhook.findMany as jest.Mock).mockResolvedValueOnce([{ id: "w1" }, { id: "w2" }]);
    await svc.emit("m1", "order.created", { orderId: "o1" });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("emit nunca lança (best-effort) mesmo se o prisma falhar", async () => {
    const { svc, prisma } = makeService();
    (prisma.webhook.findMany as jest.Mock).mockRejectedValueOnce(new Error("db down"));
    await expect(svc.emit("m1", "order.created", {})).resolves.toBeUndefined();
  });

  it("buildSignedRequest assina o corpo com o secret e inclui timestamp", () => {
    const { svc } = makeService();
    const { body, headers } = svc.buildSignedRequest("whsec_x", {
      webhookId: "w1",
      event: "order.created",
      data: { orderId: "o1" },
    });
    const parsed = JSON.parse(body);
    expect(parsed.event).toBe("order.created");
    expect(parsed.timestamp).toBeDefined();
    expect(headers["X-MarketHub-Signature"]).toBe(signWebhookBody("whsec_x", body));
    expect(headers["X-MarketHub-Event"]).toBe("order.created");
  });

  it("deliver envia, grava status ok e não relança", async () => {
    const { svc, send, webhookUpdate } = makeService({ senderOk: true });
    await svc.deliver({ webhookId: "w1", event: "order.created", data: {} });
    expect(send).toHaveBeenCalledTimes(1);
    expect(webhookUpdate.mock.calls[0][0].data.lastDeliveryStatus).toBe("ok");
  });

  it("deliver em falha grava failed e RELANÇA (retry do BullMQ)", async () => {
    const { svc, webhookUpdate } = makeService({ senderOk: false });
    await expect(
      svc.deliver({ webhookId: "w1", event: "order.created", data: {} }),
    ).rejects.toThrow();
    expect(webhookUpdate.mock.calls[0][0].data.lastDeliveryStatus).toBe("failed");
  });

  it("deliver descarta job de webhook removido/inativo", async () => {
    const { svc, send } = makeService({ webhook: null });
    await svc.deliver({ webhookId: "gone", event: "order.created", data: {} });
    expect(send).not.toHaveBeenCalled();
  });
});
