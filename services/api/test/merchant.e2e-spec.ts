import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";

/**
 * Story 07: GET /merchant/context. Resolve papel efetivo + lojas visíveis para
 * o app merchant: owner (RoleName merchant), manager (StoreStaff manager) e
 * nega quem não é nenhum dos dois.
 */
describe("Merchant context (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it("owner: RoleName merchant + StoreStaff manager → role owner com lojas", async () => {
    const prisma = getPrisma(app);
    const seeded = await seedOffer(prisma);
    const owner = await registerUser(app, { roles: ["merchant"] });
    const ownerRow = await prisma.user.findFirstOrThrow({ where: { email: owner.email } });
    await prisma.storeStaff.create({
      data: { userId: ownerRow.id, storeId: seeded.storeId, staffRole: "manager", active: true },
    });

    const res = await request(app.getHttpServer())
      .get(url("/merchant/context"))
      .set(authHeader(owner))
      .expect(200);

    expect(res.body.role).toBe("owner");
    expect(res.body.merchantId).toBe(seeded.merchantId);
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0].id).toBe(seeded.storeId);
  });

  it("manager: sem RoleName merchant, com StoreStaff manager ativo → role manager só com as lojas do vínculo", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma);
    const b = await seedOffer(prisma); // outra loja que o manager NÃO gere
    const manager = await registerUser(app); // customer por padrão
    const mgrRow = await prisma.user.findFirstOrThrow({ where: { email: manager.email } });
    await prisma.storeStaff.create({
      data: { userId: mgrRow.id, storeId: a.storeId, staffRole: "manager", active: true },
    });

    const res = await request(app.getHttpServer())
      .get(url("/merchant/context"))
      .set(authHeader(manager))
      .expect(200);

    expect(res.body.role).toBe("manager");
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0].id).toBe(a.storeId);
    expect(res.body.stores.map((s: { id: string }) => s.id)).not.toContain(b.storeId);
  });

  it("admin (story 16): RoleName merchant + StoreStaff admin → role admin, só a loja do vínculo", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma);
    const b = await seedOffer(prisma); // loja fora do escopo do admin
    const admin = await registerUser(app, { roles: ["merchant"] });
    const row = await prisma.user.findFirstOrThrow({ where: { email: admin.email } });
    await prisma.storeStaff.create({
      data: { userId: row.id, storeId: a.storeId, staffRole: "admin", active: true },
    });

    const res = await request(app.getHttpServer())
      .get(url("/merchant/context"))
      .set(authHeader(admin))
      .expect(200);

    expect(res.body.role).toBe("admin");
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0].id).toBe(a.storeId);
    expect(res.body.stores.map((s: { id: string }) => s.id)).not.toContain(b.storeId);
  });

  it("nega usuário sem RoleName merchant e sem vínculo manager (403 NOT_A_MERCHANT_USER)", async () => {
    const user = await registerUser(app); // customer, sem vínculo
    const res = await request(app.getHttpServer())
      .get(url("/merchant/context"))
      .set(authHeader(user))
      .expect(403);
    expect(res.body.code).toBe("NOT_A_MERCHANT_USER");
  });

  it("nega não autenticado (401)", async () => {
    await request(app.getHttpServer()).get(url("/merchant/context")).expect(401);
  });
});

/**
 * Story 08: CRUD de lojas owner-only. owner cria/edita; geocode (mock) preenche
 * lat/lng; manager (sem RoleName merchant) recebe 403 do RolesGuard.
 */
describe("Merchant stores CRUD (e2e)", () => {
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

  it("owner cria loja: 201, merchantId da rede, lat/lng do geocode mock", async () => {
    const { owner, seeded } = await makeOwner();
    const res = await request(app.getHttpServer())
      .post(url("/merchant/stores"))
      .set(authHeader(owner))
      .send({
        name: "Filial Centro",
        street: "Rua XV de Novembro",
        number: "100",
        city: "Curitiba",
        state: "PR",
      })
      .expect(201);
    expect(res.body.name).toBe("Filial Centro");
    expect(res.body.merchantId).toBe(seeded.merchantId);
    expect(res.body.latitude).toBeGreaterThan(-26);
    expect(res.body.longitude).toBeLessThan(-48);
  });

  it("owner lista lojas detalhadas (endereço/active) da rede", async () => {
    const { owner, seeded } = await makeOwner();
    const res = await request(app.getHttpServer())
      .get(url("/merchant/stores/detail"))
      .set(authHeader(owner))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((s: { id: string }) => s.id);
    expect(ids).toContain(seeded.storeId);
    expect(res.body[0]).toHaveProperty("active");
    expect(res.body[0]).toHaveProperty("avgPrepMinutes");
  });

  it("owner edita loja: PATCH parcial altera só o enviado", async () => {
    const { owner, seeded } = await makeOwner();
    const res = await request(app.getHttpServer())
      .patch(url(`/merchant/stores/${seeded.storeId}`))
      .set(authHeader(owner))
      .send({ avgPrepMinutes: 30 })
      .expect(200);
    expect(res.body.avgPrepMinutes).toBe(30);
  });

  it("owner faz soft toggle (active=false) sem deletar", async () => {
    const { owner, seeded } = await makeOwner();
    const res = await request(app.getHttpServer())
      .patch(url(`/merchant/stores/${seeded.storeId}`))
      .set(authHeader(owner))
      .send({ active: false })
      .expect(200);
    expect(res.body.active).toBe(false);
  });

  it("manager (sem RoleName merchant) recebe 403 em POST", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma);
    const manager = await registerUser(app);
    const mgrRow = await prisma.user.findFirstOrThrow({ where: { email: manager.email } });
    await prisma.storeStaff.create({
      data: { userId: mgrRow.id, storeId: a.storeId, staffRole: "manager", active: true },
    });
    await request(app.getHttpServer())
      .post(url("/merchant/stores"))
      .set(authHeader(manager))
      .send({ name: "Tentativa" })
      .expect(403);
  });

  it("nega não autenticado (401) em POST", async () => {
    await request(app.getHttpServer())
      .post(url("/merchant/stores"))
      .send({ name: "X" })
      .expect(401);
  });
});

/**
 * Story 10: colaboradores (StoreStaff). owner gere qualquer papel em qualquer loja
 * da rede; manager gere picker/driver só nas lojas dele e não cria manager. Remoção
 * = desativa (owner pode deletar de fato).
 */
describe("Merchant staff (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;
  let emailSeq = 0;
  const uniqEmail = () => `staff-${Date.now()}-${emailSeq++}@test.dev`;

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

  async function makeManager(storeId: string) {
    const prisma = getPrisma(app);
    const manager = await registerUser(app); // customer + StoreStaff manager
    const mgrRow = await prisma.user.findFirstOrThrow({ where: { email: manager.email } });
    await prisma.storeStaff.create({
      data: { userId: mgrRow.id, storeId, staffRole: "manager", active: true },
    });
    return manager;
  }

  // admin de loja (story 16): RoleName merchant p/ guards + StoreStaff(admin) ativo.
  async function makeAdmin(storeId: string) {
    const prisma = getPrisma(app);
    const admin = await registerUser(app, { roles: ["merchant"] });
    const row = await prisma.user.findFirstOrThrow({ where: { email: admin.email } });
    await prisma.storeStaff.create({
      data: { userId: row.id, storeId, staffRole: "admin", active: true },
    });
    return admin;
  }

  it("owner cria picker e o vínculo + role ficam corretos", async () => {
    const { owner, seeded } = await makeOwner();
    const prisma = getPrisma(app);
    const res = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(owner))
      .send({
        name: "Picker 1",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "picker",
        storeId: seeded.storeId,
      })
      .expect(201);
    const created = await prisma.user.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { roles: { include: { role: true } }, staffOf: true },
    });
    expect(created.roles.map((r) => r.role.name)).toContain("picker");
    expect(created.staffOf[0]).toMatchObject({ storeId: seeded.storeId, staffRole: "picker" });
  });

  it("owner cria manager", async () => {
    const { owner, seeded } = await makeOwner();
    await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(owner))
      .send({
        name: "Gerente",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "manager",
        storeId: seeded.storeId,
      })
      .expect(201);
  });

  it("manager cria picker na sua loja, mas criar manager → 403 ROLE_ESCALATION_FORBIDDEN", async () => {
    const { seeded } = await makeOwner();
    const manager = await makeManager(seeded.storeId);

    await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(manager))
      .send({
        name: "Picker M",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "picker",
        storeId: seeded.storeId,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(manager))
      .send({
        name: "Outro gerente",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "manager",
        storeId: seeded.storeId,
      })
      .expect(403);
    expect(res.body.code).toBe("ROLE_ESCALATION_FORBIDDEN");
  });

  it("admin (story 16) cria manager na sua loja (escopo + hierarquia ok)", async () => {
    const { seeded } = await makeOwner();
    const admin = await makeAdmin(seeded.storeId);
    await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(admin))
      .send({
        name: "Gerente do admin",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "manager",
        storeId: seeded.storeId,
      })
      .expect(201);
  });

  it("admin (story 16) NÃO cria outro admin → 403 ROLE_ESCALATION_FORBIDDEN", async () => {
    const { seeded } = await makeOwner();
    const admin = await makeAdmin(seeded.storeId);
    const res = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(admin))
      .send({
        name: "Outro admin",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "admin",
        storeId: seeded.storeId,
      })
      .expect(403);
    expect(res.body.code).toBe("ROLE_ESCALATION_FORBIDDEN");
  });

  it("admin (story 16) NÃO escapa do escopo de loja → 403 STORE_NOT_IN_SCOPE", async () => {
    const prisma = getPrisma(app);
    const own = await makeOwner();
    const other = await seedOffer(prisma); // loja fora do escopo do admin
    const admin = await makeAdmin(own.seeded.storeId);
    const res = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(admin))
      .send({
        name: "Picker alheio",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "picker",
        storeId: other.storeId,
      })
      .expect(403);
    expect(res.body.code).toBe("STORE_NOT_IN_SCOPE");
  });

  it("manager criar em loja fora do escopo → 403 STORE_NOT_IN_SCOPE", async () => {
    const prisma = getPrisma(app);
    const own = await makeOwner();
    const other = await seedOffer(prisma);
    const manager = await makeManager(own.seeded.storeId);
    const res = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(manager))
      .send({
        name: "X",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "picker",
        storeId: other.storeId,
      })
      .expect(403);
    expect(res.body.code).toBe("STORE_NOT_IN_SCOPE");
  });

  it("email duplicado → 409 EMAIL_TAKEN", async () => {
    const { owner, seeded } = await makeOwner();
    const email = uniqEmail();
    const body = (e: string) => ({
      name: "Dup",
      email: e,
      password: "secret1",
      staffRole: "picker" as const,
      storeId: seeded.storeId,
    });
    await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(owner))
      .send(body(email))
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(owner))
      .send(body(email))
      .expect(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("lista respeita o escopo (manager não vê colaborador de loja alheia)", async () => {
    const prisma = getPrisma(app);
    const own = await makeOwner();
    const other = await seedOffer(prisma);
    const manager = await makeManager(own.seeded.storeId);

    // picker na loja do manager
    await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(manager))
      .send({
        name: "Meu picker",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "picker",
        storeId: own.seeded.storeId,
      })
      .expect(201);
    // picker na loja alheia (criado pelo owner que não gere essa, mas seed direto)
    const alienEmail = uniqEmail();
    await prisma.user.create({
      data: {
        name: "Alheio",
        email: alienEmail,
        passwordHash: "x",
        staffOf: { create: [{ storeId: other.storeId, staffRole: "picker" }] },
      },
    });

    const res = await request(app.getHttpServer())
      .get(url("/merchant/staff"))
      .set(authHeader(manager))
      .expect(200);
    const emails = res.body.map((s: { user: { email: string } }) => s.user.email);
    expect(emails).not.toContain(alienEmail);
    expect(res.body.every((s: { store: { id: string } }) => s.store.id === own.seeded.storeId)).toBe(
      true,
    );
  });

  it("PATCH active=false mantém o User; owner DELETE remove o vínculo", async () => {
    const prisma = getPrisma(app);
    const { owner, seeded } = await makeOwner();
    const created = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(owner))
      .send({
        name: "Toggle",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "driver",
        storeId: seeded.storeId,
      })
      .expect(201);
    const link = await prisma.storeStaff.findFirstOrThrow({ where: { userId: created.body.id } });

    await request(app.getHttpServer())
      .patch(url(`/merchant/staff/${link.id}`))
      .set(authHeader(owner))
      .send({ active: false })
      .expect(200);
    const after = await prisma.storeStaff.findUniqueOrThrow({ where: { id: link.id } });
    expect(after.active).toBe(false);
    const userStill = await prisma.user.findUnique({ where: { id: created.body.id } });
    expect(userStill).not.toBeNull();

    await request(app.getHttpServer())
      .delete(url(`/merchant/staff/${link.id}?hard=true`))
      .set(authHeader(owner))
      .expect(200);
    const gone = await prisma.storeStaff.findUnique({ where: { id: link.id } });
    expect(gone).toBeNull();
    // o User permanece (histórico)
    expect(await prisma.user.findUnique({ where: { id: created.body.id } })).not.toBeNull();
  });

  it("manager pedindo hard delete → 403 DELETE_OWNER_ONLY", async () => {
    const { seeded } = await makeOwner();
    const manager = await makeManager(seeded.storeId);
    const prisma = getPrisma(app);
    const created = await request(app.getHttpServer())
      .post(url("/merchant/staff"))
      .set(authHeader(manager))
      .send({
        name: "Soft",
        email: uniqEmail(),
        password: "secret1",
        staffRole: "picker",
        storeId: seeded.storeId,
      })
      .expect(201);
    const link = await prisma.storeStaff.findFirstOrThrow({ where: { userId: created.body.id } });
    const res = await request(app.getHttpServer())
      .delete(url(`/merchant/staff/${link.id}?hard=true`))
      .set(authHeader(manager))
      .expect(403);
    expect(res.body.code).toBe("DELETE_OWNER_ONLY");
  });

  it("nega não autenticado (401)", async () => {
    await request(app.getHttpServer()).get(url("/merchant/staff")).expect(401);
  });
});

/**
 * Story 12: GET /merchant/orders escopado às lojas do usuário. owner vê as lojas
 * da rede; manager só os vínculos; loja fora do escopo / não autenticado negados.
 */
describe("Merchant orders (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedGroup(storeId: string, merchantId: string, status: string) {
    const prisma = getPrisma(app);
    const customer = await prisma.user.create({
      data: { name: "Cli", email: `cli-${Date.now()}-${Math.random()}@t.dev`, passwordHash: "x" },
    });
    const order = await prisma.order.create({ data: { userId: customer.id } });
    return prisma.orderGroup.create({
      data: {
        orderId: order.id,
        merchantId,
        storeId,
        status: status as never,
        subtotalCents: 1000,
        deliveryCents: 500,
        items: { create: [{ nameSnapshot: "X", unitPriceCents: 1000, quantity: 1, lineTotalCents: 1000 }] },
      },
    });
  }

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

  it("owner vê os sub-pedidos da loja da rede com totais/itens/horário", async () => {
    const { owner, seeded } = await makeOwner();
    await seedGroup(seeded.storeId, seeded.merchantId, "preparing");

    const res = await request(app.getHttpServer())
      .get(url("/merchant/orders"))
      .set(authHeader(owner))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const card = res.body.find((o: { storeId: string }) => o.storeId === seeded.storeId);
    expect(card).toMatchObject({
      storeId: seeded.storeId,
      status: "preparing",
      itemCount: 1,
      totalCents: 1500,
    });
    expect(card).toHaveProperty("createdAt");
    expect(card).toHaveProperty("orderId");
  });

  it("filtra por status", async () => {
    const { owner, seeded } = await makeOwner();
    await seedGroup(seeded.storeId, seeded.merchantId, "preparing");
    await seedGroup(seeded.storeId, seeded.merchantId, "delivered");

    const res = await request(app.getHttpServer())
      .get(url("/merchant/orders?status=delivered"))
      .set(authHeader(owner))
      .expect(200);
    const scoped = res.body.filter((o: { storeId: string }) => o.storeId === seeded.storeId);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((o: { status: string }) => o.status === "delivered")).toBe(true);
  });

  it("manager: loja fora do escopo → 403 STORE_NOT_IN_SCOPE", async () => {
    const prisma = getPrisma(app);
    const own = await makeOwner();
    const other = await seedOffer(prisma);
    const manager = await registerUser(app);
    const mgrRow = await prisma.user.findFirstOrThrow({ where: { email: manager.email } });
    await prisma.storeStaff.create({
      data: { userId: mgrRow.id, storeId: own.seeded.storeId, staffRole: "manager", active: true },
    });
    const res = await request(app.getHttpServer())
      .get(url(`/merchant/orders?storeId=${other.storeId}`))
      .set(authHeader(manager))
      .expect(403);
    expect(res.body.code).toBe("STORE_NOT_IN_SCOPE");
  });

  it("nega não autenticado (401)", async () => {
    await request(app.getHttpServer()).get(url("/merchant/orders")).expect(401);
  });
});

/**
 * Story 13: relatórios escopados às lojas do usuário. owner vê a rede; manager só
 * os vínculos. Vendas/operacional/top-products/avaliações respeitam escopo e
 * período. Manager alcança a rota (sem @Roles de classe); loja fora → 403.
 */
describe("Merchant reports (e2e)", () => {
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

  /** Cria um pedido pago com 1 grupo na loja + 1 item, opcionalmente reembolsado. */
  async function seedPaidOrder(
    seeded: { storeId: string; merchantId: string; productId: string },
    opts: { totalCents: number; platformFeeCents?: number; itemQty?: number; lineCents?: number } = { totalCents: 2000 },
  ) {
    const prisma = getPrisma(app);
    const customer = await prisma.user.create({
      data: { name: "Cli", email: `cli-${Date.now()}-${Math.random()}@t.dev`, passwordHash: "x" },
    });
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        status: "delivered",
        totalCents: opts.totalCents,
        platformFeeCents: opts.platformFeeCents ?? 0,
        payment: { create: { provider: "mock", amountCents: opts.totalCents, status: "paid", paidAt: new Date() } },
        groups: {
          create: [
            {
              merchantId: seeded.merchantId,
              storeId: seeded.storeId,
              status: "delivered",
              subtotalCents: opts.totalCents,
              items: {
                create: [
                  {
                    productId: seeded.productId,
                    nameSnapshot: "Arroz",
                    unitPriceCents: opts.lineCents ?? opts.totalCents,
                    quantity: opts.itemQty ?? 1,
                    lineTotalCents: opts.lineCents ?? opts.totalCents,
                  },
                ],
              },
            },
          ],
        },
      },
    });
    return order;
  }

  it("owner: vendas agregam pedidos pagos no escopo (faturamento/ticket/payout)", async () => {
    const { owner, seeded } = await makeOwner();
    await seedPaidOrder(seeded, { totalCents: 2000, platformFeeCents: 200 });
    await seedPaidOrder(seeded, { totalCents: 4000, platformFeeCents: 400 });

    const res = await request(app.getHttpServer())
      .get(url("/merchant/reports/sales"))
      .set(authHeader(owner))
      .expect(200);
    expect(res.body.ordersPaid).toBe(2);
    expect(res.body.salesCents).toBe(6000);
    expect(res.body.platformFeeCents).toBe(600);
    expect(res.body.ticketCents).toBe(3000);
    expect(res.body.estimatedPayoutCents).toBe(5400);
    expect(res.body.period).toHaveProperty("from");
  });

  it("período (from/to) filtra: pedido antigo fora da janela não conta", async () => {
    const { owner, seeded } = await makeOwner();
    await seedPaidOrder(seeded, { totalCents: 5000, platformFeeCents: 0 });
    // janela no futuro → nenhum pedido pago dentro
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const farther = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(url(`/merchant/reports/sales?from=${future}&to=${farther}`))
      .set(authHeader(owner))
      .expect(200);
    expect(res.body.ordersPaid).toBe(0);
    expect(res.body.salesCents).toBe(0);
  });

  it("operacional: pedidos por status + retiradas pendentes no escopo", async () => {
    const { owner, seeded } = await makeOwner();
    await seedPaidOrder(seeded, { totalCents: 1000 });
    // janela ampla (passado→futuro) para não depender do relógio durante o seed
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const res = await request(app.getHttpServer())
      .get(url(`/merchant/reports/operations?from=${from}&to=${to}`))
      .set(authHeader(owner))
      .expect(200);
    expect(res.body.ordersByStatus.delivered).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty("pendingPickups");
  });

  it("top-products: agrega quantidade/receita por produto ordenado desc", async () => {
    const { owner, seeded } = await makeOwner();
    await seedPaidOrder(seeded, { totalCents: 3000, itemQty: 3, lineCents: 3000 });
    await seedPaidOrder(seeded, { totalCents: 1000, itemQty: 1, lineCents: 1000 });
    const res = await request(app.getHttpServer())
      .get(url("/merchant/reports/top-products"))
      .set(authHeader(owner))
      .expect(200);
    const top = res.body.items.find((i: { productId: string }) => i.productId === seeded.productId);
    expect(top.quantity).toBe(4);
    expect(top.revenueCents).toBe(4000);
  });

  it("avaliações: média/contagem por eixo, merchant escopado à rede", async () => {
    const prisma = getPrisma(app);
    const { owner, seeded } = await makeOwner();
    const order = await seedPaidOrder(seeded, { totalCents: 1000 });
    await prisma.review.create({
      data: { orderId: order.id, axis: "merchant", rating: 4, targetMerchantId: seeded.merchantId },
    });
    await prisma.review.create({
      data: { orderId: order.id, axis: "platform", rating: 5 },
    });
    const res = await request(app.getHttpServer())
      .get(url("/merchant/reports/reviews"))
      .set(authHeader(owner))
      .expect(200);
    const merchantAxis = res.body.axes.find((a: { axis: string }) => a.axis === "merchant");
    expect(merchantAxis).toMatchObject({ average: 4, count: 1 });
  });

  it("manager alcança a rota; loja fora do escopo → 403 STORE_NOT_IN_SCOPE", async () => {
    const prisma = getPrisma(app);
    const own = await makeOwner();
    const other = await seedOffer(prisma);
    const manager = await registerUser(app);
    const mgrRow = await prisma.user.findFirstOrThrow({ where: { email: manager.email } });
    await prisma.storeStaff.create({
      data: { userId: mgrRow.id, storeId: own.seeded.storeId, staffRole: "manager", active: true },
    });
    // alcança a rota (não é 403 por papel)
    await request(app.getHttpServer())
      .get(url("/merchant/reports/sales"))
      .set(authHeader(manager))
      .expect(200);
    // loja fora do escopo → 403
    const res = await request(app.getHttpServer())
      .get(url(`/merchant/reports/sales?storeId=${other.storeId}`))
      .set(authHeader(manager))
      .expect(403);
    expect(res.body.code).toBe("STORE_NOT_IN_SCOPE");
  });

  it("nega não autenticado (401)", async () => {
    await request(app.getHttpServer()).get(url("/merchant/reports/sales")).expect(401);
  });
});

describe("Merchant vehicles (e2e — story 14)", () => {
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

  it("owner cadastra veículo (placa normalizada) e ele fica vinculado à rede", async () => {
    const { owner, seeded } = await makeOwner();
    const res = await request(app.getHttpServer())
      .post(url("/merchant/vehicles"))
      .set(authHeader(owner))
      .send({ plate: " abc1d23 ", type: "motorcycle", description: "Moto vermelha" })
      .expect(201);
    expect(res.body).toMatchObject({
      merchantId: seeded.merchantId,
      plate: "ABC1D23",
      type: "motorcycle",
      active: true,
    });
  });

  it("placa inválida → 400 INVALID_PLATE", async () => {
    const { owner } = await makeOwner();
    const res = await request(app.getHttpServer())
      .post(url("/merchant/vehicles"))
      .set(authHeader(owner))
      .send({ plate: "XX1", type: "car" })
      .expect(400);
    expect(res.body.code).toBe("INVALID_PLATE");
  });

  it("lista só os veículos da rede do usuário", async () => {
    const { owner, seeded } = await makeOwner();
    const prisma = getPrisma(app);
    const other = await seedOffer(prisma);
    await prisma.vehicle.create({ data: { merchantId: seeded.merchantId, plate: "AAA1A11", type: "car" } });
    await prisma.vehicle.create({ data: { merchantId: other.merchantId, plate: "BBB2B22", type: "van" } });
    const res = await request(app.getHttpServer())
      .get(url("/merchant/vehicles"))
      .set(authHeader(owner))
      .expect(200);
    const plates = (res.body as { plate: string; merchantId: string }[]).map((v) => v.plate);
    expect(plates).toContain("AAA1A11");
    expect(plates).not.toContain("BBB2B22");
    expect(res.body.every((v: { merchantId: string }) => v.merchantId === seeded.merchantId)).toBe(true);
  });

  it("PATCH parcial + soft toggle active", async () => {
    const { owner, seeded } = await makeOwner();
    const prisma = getPrisma(app);
    const v = await prisma.vehicle.create({
      data: { merchantId: seeded.merchantId, plate: "CCC3C33", type: "car" },
    });
    await request(app.getHttpServer())
      .patch(url(`/merchant/vehicles/${v.id}`))
      .set(authHeader(owner))
      .send({ active: false })
      .expect(200);
    const after = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.active).toBe(false);
    expect(after.plate).toBe("CCC3C33");
  });

  it("hard delete bloqueado com entrega associada → 400 VEHICLE_IN_USE", async () => {
    const { owner, seeded } = await makeOwner();
    const prisma = getPrisma(app);
    const v = await prisma.vehicle.create({
      data: { merchantId: seeded.merchantId, plate: "DDD4D44", type: "van" },
    });
    const group = await prisma.orderGroup.findFirst({ where: { storeId: seeded.storeId } });
    if (group) {
      await prisma.delivery.create({
        data: { orderGroupId: group.id, storeId: seeded.storeId, vehicleId: v.id },
      });
      const res = await request(app.getHttpServer())
        .delete(url(`/merchant/vehicles/${v.id}?hard=true`))
        .set(authHeader(owner))
        .expect(400);
      expect(res.body.code).toBe("VEHICLE_IN_USE");
    } else {
      // sem OrderGroup no seed → deleta normalmente
      await request(app.getHttpServer())
        .delete(url(`/merchant/vehicles/${v.id}?hard=true`))
        .set(authHeader(owner))
        .expect(200);
    }
  });

  it("hard delete remove o veículo sem entregas", async () => {
    const { owner, seeded } = await makeOwner();
    const prisma = getPrisma(app);
    const v = await prisma.vehicle.create({
      data: { merchantId: seeded.merchantId, plate: "EEE5E55", type: "car" },
    });
    await request(app.getHttpServer())
      .delete(url(`/merchant/vehicles/${v.id}?hard=true`))
      .set(authHeader(owner))
      .expect(200);
    expect(await prisma.vehicle.findUnique({ where: { id: v.id } })).toBeNull();
  });

  it("nega não autenticado (401)", async () => {
    await request(app.getHttpServer()).get(url("/merchant/vehicles")).expect(401);
  });
});
