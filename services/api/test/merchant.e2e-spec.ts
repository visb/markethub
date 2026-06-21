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
