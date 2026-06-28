import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";

/**
 * C11: edição admin de produto via PATCH /admin/products/:id — só os campos
 * enviados são gravados e TRAVADOS (lockedFields acumulam, diff-only), unlock
 * destrava, e o RolesGuard barra não-admin.
 */
describe("Admin catalog (e2e)", () => {
  let app: INestApplication;
  let admin: TestUser;
  let productId: string;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
    admin = await registerUser(app, { roles: ["admin"] });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const product = await getPrisma(app).product.create({
      data: { name: "Produto Teste", saleType: "unit" },
    });
    productId = product.id;
  });

  it("PATCH grava só o campo enviado e o trava (lockedFields)", async () => {
    const res = await request(app.getHttpServer())
      .patch(url(`/admin/products/${productId}`))
      .set(authHeader(admin))
      .send({ brand: "Marca X" })
      .expect(200);

    expect(res.body.brand).toBe("Marca X");
    expect(res.body.name).toBe("Produto Teste"); // não enviado → intacto
    expect(res.body.lockedFields).toEqual(["brand"]);
  });

  it("PATCHs sucessivos acumulam lockedFields sem duplicar", async () => {
    await request(app.getHttpServer())
      .patch(url(`/admin/products/${productId}`))
      .set(authHeader(admin))
      .send({ brand: "Marca X" })
      .expect(200);
    const res = await request(app.getHttpServer())
      .patch(url(`/admin/products/${productId}`))
      .set(authHeader(admin))
      .send({ packageSize: "2L" })
      .expect(200);

    expect(new Set(res.body.lockedFields)).toEqual(new Set(["brand", "packageSize"]));
  });

  it("unlock destrava o campo", async () => {
    await request(app.getHttpServer())
      .patch(url(`/admin/products/${productId}`))
      .set(authHeader(admin))
      .send({ brand: "Marca X" })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(url(`/admin/products/${productId}/unlock`))
      .set(authHeader(admin))
      .send({ fields: ["brand"] })
      .expect(201);

    expect(res.body.lockedFields).not.toContain("brand");
  });

  it("não-admin → 403", async () => {
    const customer = await registerUser(app);
    await request(app.getHttpServer())
      .patch(url(`/admin/products/${productId}`))
      .set(authHeader(customer))
      .send({ brand: "Hack" })
      .expect(403);
  });

  it("detail reflete o produto após edição", async () => {
    await request(app.getHttpServer())
      .patch(url(`/admin/products/${productId}`))
      .set(authHeader(admin))
      .send({ name: "Novo Nome" })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(url(`/admin/products/${productId}`))
      .set(authHeader(admin))
      .expect(200);

    expect(res.body.name).toBe("Novo Nome");
    expect(res.body.lockedFields).toContain("name");
  });
});

/**
 * Story 04: GET /stores/nearby — lojas no viewport (bounding box). Público,
 * filtra por lat/lng no range (exclui nulos), valida bounds (INVALID_BOUNDS) e
 * a rota estática `nearby` não é capturada por `stores/:id`.
 */
describe("Stores nearby (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
    const prisma = getPrisma(app);
    const merchant = await prisma.merchant.create({
      data: { name: "Rede Nearby", slug: `rede-nearby-${Date.now()}`, deliveryFeeCents: 700 },
    });
    await prisma.store.createMany({
      data: [
        // dentro do box [-1..1, -1..1]
        { merchantId: merchant.id, name: "Dentro", latitude: 0.5, longitude: 0.5 },
        // fora (longitude)
        { merchantId: merchant.id, name: "Fora", latitude: 0.5, longitude: 50 },
        // sem coordenadas
        { merchantId: merchant.id, name: "SemGeo", latitude: null, longitude: null },
        // inativa, dentro do box
        { merchantId: merchant.id, name: "Inativa", latitude: 0.2, longitude: 0.2, active: false },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("retorna só lojas ativas com geo dentro do box", async () => {
    const res = await request(app.getHttpServer())
      .get(url("/stores/nearby?north=1&south=-1&east=1&west=-1"))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const names = res.body.map((s: { name: string }) => s.name);
    expect(names).toEqual(["Dentro"]);
    expect(res.body[0]).toMatchObject({
      name: "Dentro",
      latitude: 0.5,
      longitude: 0.5,
      merchantName: "Rede Nearby",
    });
  });

  it("não é capturada por stores/:id (rota estática casa primeiro)", async () => {
    // se 'nearby' caísse em stores/:id/... daria 404 STORE_NOT_FOUND, não 200 lista
    await request(app.getHttpServer())
      .get(url("/stores/nearby?north=1&south=-1&east=1&west=-1"))
      .expect(200);
  });

  it("bounds faltando → 400", async () => {
    await request(app.getHttpServer()).get(url("/stores/nearby?north=1&south=-1")).expect(400);
  });

  it("north < south → 400 INVALID_BOUNDS", async () => {
    const res = await request(app.getHttpServer())
      .get(url("/stores/nearby?north=-1&south=1&east=1&west=-1"))
      .expect(400);
    expect(res.body.code).toBe("INVALID_BOUNDS");
  });
});

/**
 * Story 29: GET /stores/:id/summary (público) — resumo da loja para o modal do
 * explore. Verifica a montagem do DTO, faixa de frete (piso/teto), allowsPickup,
 * openNow (computado no servidor), 404 STORE_NOT_FOUND e que a rota não colide
 * com `stores/nearby`. Admin: PATCH phone/allowsPickup + PUT /hours (replace-all).
 */
describe("Store summary + admin hours (e2e)", () => {
  let app: INestApplication;
  let admin: TestUser;
  let merchantId: string;
  let storeId: string;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
    admin = await registerUser(app, { roles: ["admin"] });
    const prisma = getPrisma(app);
    const merchant = await prisma.merchant.create({
      data: { name: "Rede Summary", slug: `rede-summary-${Date.now()}`, deliveryFeeCents: 700 },
    });
    merchantId = merchant.id;
    const store = await prisma.store.create({
      data: {
        merchantId: merchant.id,
        name: "Loja Summary - Centro",
        street: "Rua A",
        number: "10",
        district: "Centro",
        city: "Curitiba",
        state: "PR",
        avgPrepMinutes: 25,
        phone: "(41) 3000-9999",
        allowsPickup: true,
      },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("monta o DTO com endereço, ETA, faixa de frete e flags", async () => {
    const res = await request(app.getHttpServer())
      .get(url(`/stores/${storeId}/summary`))
      .expect(200);
    expect(res.body).toMatchObject({
      id: storeId,
      name: "Loja Summary - Centro",
      merchantName: "Rede Summary",
      address: { street: "Rua A", number: "10", city: "Curitiba", state: "PR" },
      phone: "(41) 3000-9999",
      etaMinutes: 25,
      deliveryFeeCents: 700,
      doorFeeCents: 1100,
      allowsPickup: true,
      rating: null,
    });
    expect(typeof res.body.openNow).toBe("boolean");
  });

  it("loja inexistente → 404 STORE_NOT_FOUND", async () => {
    const res = await request(app.getHttpServer())
      .get(url("/stores/nao-existe/summary"))
      .expect(404);
    expect(res.body.code).toBe("STORE_NOT_FOUND");
  });

  it("loja inativa → 404 STORE_NOT_FOUND", async () => {
    const prisma = getPrisma(app);
    const inactive = await prisma.store.create({
      data: { merchantId, name: "Inativa", active: false },
    });
    const res = await request(app.getHttpServer())
      .get(url(`/stores/${inactive.id}/summary`))
      .expect(404);
    expect(res.body.code).toBe("STORE_NOT_FOUND");
  });

  it("rating agrega reviews axis=merchant após avaliação", async () => {
    const prisma = getPrisma(app);
    const customer = await registerUser(app);
    const me = await prisma.user.findUnique({ where: { email: customer.email } });
    const order = await prisma.order.create({ data: { userId: me!.id, status: "delivered" } });
    await prisma.review.create({
      data: { orderId: order.id, axis: "merchant", rating: 4, targetMerchantId: merchantId },
    });
    const res = await request(app.getHttpServer())
      .get(url(`/stores/${storeId}/summary`))
      .expect(200);
    expect(res.body.rating).toEqual({ average: 4, count: 1 });
  });

  it("admin PATCH grava phone/allowsPickup parcialmente", async () => {
    await request(app.getHttpServer())
      .patch(url(`/admin/stores/${storeId}`))
      .set(authHeader(admin))
      .send({ allowsPickup: false })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get(url(`/stores/${storeId}/summary`))
      .expect(200);
    expect(res.body.allowsPickup).toBe(false);
    expect(res.body.phone).toBe("(41) 3000-9999"); // não enviado → intacto
  });

  it("admin PUT /hours substitui o horário semanal (replace-all)", async () => {
    const res = await request(app.getHttpServer())
      .put(url(`/admin/stores/${storeId}/hours`))
      .set(authHeader(admin))
      .send({ hours: [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }] })
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ dayOfWeek: 1, opensAt: 480, closesAt: 1320 });
  });

  it("admin PUT /hours recusa closesAt ≤ opensAt", async () => {
    const res = await request(app.getHttpServer())
      .put(url(`/admin/stores/${storeId}/hours`))
      .set(authHeader(admin))
      .send({ hours: [{ dayOfWeek: 1, opensAt: 600, closesAt: 600 }] })
      .expect(400);
    expect(res.body.code).toBe("INVALID_HOURS");
  });

  it("hours endpoint exige admin (403 p/ não-admin)", async () => {
    const customer = await registerUser(app);
    await request(app.getHttpServer())
      .put(url(`/admin/stores/${storeId}/hours`))
      .set(authHeader(customer))
      .send({ hours: [] })
      .expect(403);
  });
});
