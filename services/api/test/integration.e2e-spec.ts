import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";

/**
 * Story 09: configuração de integração owner-only — ERP config (mascarado),
 * api-keys de entrada (revelada 1x, só hash persistido) e webhooks de saída
 * (secret revelado 1x, mascarado na leitura). Disparo HTTP real fica fora do
 * e2e (mockado nos unit tests); aqui validamos a API e o owner-only.
 */
describe("Merchant integration (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  async function makeOwner() {
    const prisma = getPrisma(app);
    const seeded = await seedOffer(prisma);
    const owner = await registerUser(app, { roles: ["merchant"] });
    const ownerRow = await prisma.user.findFirstOrThrow({ where: { email: owner.email } });
    await prisma.storeStaff.create({
      data: { userId: ownerRow.id, storeId: seeded.storeId, staffRole: "manager", active: true },
    });
    return { owner, seeded };
  }

  async function makeManager() {
    const prisma = getPrisma(app);
    const seeded = await seedOffer(prisma);
    const manager = await registerUser(app);
    const mgrRow = await prisma.user.findFirstOrThrow({ where: { email: manager.email } });
    await prisma.storeStaff.create({
      data: { userId: mgrRow.id, storeId: seeded.storeId, staffRole: "manager", active: true },
    });
    return { manager };
  }

  // ── ERP ──

  it("owner: PUT grava ERP config; GET volta com segredo MASCARADO", async () => {
    const { owner } = await makeOwner();
    await request(app.getHttpServer())
      .put(url("/merchant/integration/erp"))
      .set(authHeader(owner))
      .send({ connectorType: "csv", connectorConfig: { dir: "/data", apiKey: "super-secret" } })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(url("/merchant/integration/erp"))
      .set(authHeader(owner))
      .expect(200);
    expect(res.body.connectorType).toBe("csv");
    expect(res.body.connectorConfig.dir).toBe("/data");
    expect(res.body.connectorConfig.apiKey).toBe("****cret"); // mascarado
    expect(res.body.availableTypes).toContain("csv");
  });

  it("PATCH com valor mascarado não apaga o segredo atual", async () => {
    const { owner } = await makeOwner();
    await request(app.getHttpServer())
      .put(url("/merchant/integration/erp"))
      .set(authHeader(owner))
      .send({ connectorType: "csv", connectorConfig: { dir: "/data", apiKey: "keep-me" } })
      .expect(200);
    // reenvia o mascarado → segredo preservado
    await request(app.getHttpServer())
      .put(url("/merchant/integration/erp"))
      .set(authHeader(owner))
      .send({ connectorType: "csv", connectorConfig: { dir: "/outro", apiKey: "****p-me" } })
      .expect(200);

    const prisma = getPrisma(app);
    const m = await prisma.merchant.findFirstOrThrow({
      where: { connectorConfig: { path: ["dir"], equals: "/outro" } },
    });
    expect((m.connectorConfig as Record<string, unknown>).apiKey).toBe("keep-me");
  });

  it("config inválido p/ o tipo → 400", async () => {
    const { owner } = await makeOwner();
    const res = await request(app.getHttpServer())
      .put(url("/merchant/integration/erp"))
      .set(authHeader(owner))
      .send({ connectorType: "csv", connectorConfig: {} })
      .expect(400);
    expect(res.body.code).toBe("INVALID_ERP_CONFIG");
  });

  // ── Api-keys ──

  it("api-key: criação revela 1x e persiste só o hash; lista não expõe o valor", async () => {
    const { owner } = await makeOwner();
    const created = await request(app.getHttpServer())
      .post(url("/merchant/integration/api-keys"))
      .set(authHeader(owner))
      .send({ name: "ERP" })
      .expect(201);
    expect(created.body.key).toMatch(/^mk_live_/);

    const prisma = getPrisma(app);
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.keyHash).toBeDefined();
    expect(row.keyHash).not.toBe(created.body.key); // hash, não o valor

    const list = await request(app.getHttpServer())
      .get(url("/merchant/integration/api-keys"))
      .set(authHeader(owner))
      .expect(200);
    expect(list.body[0]).not.toHaveProperty("keyHash");
    expect(list.body[0]).not.toHaveProperty("key");
    expect(list.body[0].prefix).toMatch(/^mk_live_/);
  });

  it("revogar api-key marca revokedAt", async () => {
    const { owner } = await makeOwner();
    const created = await request(app.getHttpServer())
      .post(url("/merchant/integration/api-keys"))
      .set(authHeader(owner))
      .send({ name: "Temp" })
      .expect(201);
    const res = await request(app.getHttpServer())
      .delete(url(`/merchant/integration/api-keys/${created.body.id}`))
      .set(authHeader(owner))
      .expect(200);
    expect(res.body.revokedAt).toBeTruthy();
  });

  // ── Webhooks ──

  it("webhook: criação revela secret 1x; lista mascara; eventos default", async () => {
    const { owner } = await makeOwner();
    const created = await request(app.getHttpServer())
      .post(url("/merchant/integration/webhooks"))
      .set(authHeader(owner))
      .send({ url: "https://merchant.example/wh" })
      .expect(201);
    expect(created.body.secret).toMatch(/^whsec_/);
    expect(created.body.events).toEqual(["order.created", "order.status_changed"]);

    const list = await request(app.getHttpServer())
      .get(url("/merchant/integration/webhooks"))
      .set(authHeader(owner))
      .expect(200);
    const found = list.body.find((w: { id: string }) => w.id === created.body.id);
    expect(found).not.toHaveProperty("secret");
    expect(found.secretMasked).toMatch(/^\*\*\*\*/);
  });

  it("webhook: evento inválido → 400", async () => {
    const { owner } = await makeOwner();
    const res = await request(app.getHttpServer())
      .post(url("/merchant/integration/webhooks"))
      .set(authHeader(owner))
      .send({ url: "https://x.example", events: ["payment.refunded"] })
      .expect(400);
    expect(res.body.code).toBe("INVALID_EVENT");
  });

  it("webhook: testar enfileira ping (200)", async () => {
    const { owner } = await makeOwner();
    const created = await request(app.getHttpServer())
      .post(url("/merchant/integration/webhooks"))
      .set(authHeader(owner))
      .send({ url: "https://merchant.example/wh" })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(url(`/merchant/integration/webhooks/${created.body.id}/test`))
      .set(authHeader(owner))
      .expect(201);
    expect(res.body.enqueued).toBe(true);
  });

  // ── owner-only ──

  it("manager (sem RoleName merchant) → 403 em todas as rotas de integração", async () => {
    const { manager } = await makeManager();
    await request(app.getHttpServer())
      .get(url("/merchant/integration/erp"))
      .set(authHeader(manager))
      .expect(403);
    await request(app.getHttpServer())
      .get(url("/merchant/integration/api-keys"))
      .set(authHeader(manager))
      .expect(403);
    await request(app.getHttpServer())
      .post(url("/merchant/integration/webhooks"))
      .set(authHeader(manager))
      .send({ url: "https://x.example" })
      .expect(403);
  });

  it("admin (story 16): acessa a integração (resolve a rede via vínculo admin)", async () => {
    const prisma = getPrisma(app);
    const seeded = await seedOffer(prisma);
    const admin = await registerUser(app, { roles: ["merchant"] });
    const row = await prisma.user.findFirstOrThrow({ where: { email: admin.email } });
    await prisma.storeStaff.create({
      data: { userId: row.id, storeId: seeded.storeId, staffRole: "admin", active: true },
    });

    await request(app.getHttpServer())
      .put(url("/merchant/integration/erp"))
      .set(authHeader(admin))
      .send({ connectorType: "csv", connectorConfig: { dir: "/data", apiKey: "s" } })
      .expect(200);
    await request(app.getHttpServer())
      .get(url("/merchant/integration/erp"))
      .set(authHeader(admin))
      .expect(200);
  });

  it("não autenticado → 401", async () => {
    await request(app.getHttpServer()).get(url("/merchant/integration/erp")).expect(401);
  });
});
