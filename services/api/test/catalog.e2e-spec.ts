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
