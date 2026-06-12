import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";

/**
 * Smoke do harness: prova escrita no banco de teste + guard JWT + helpers de auth.
 */
describe("Auth (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it("register emite tokens e /me retorna o usuário", async () => {
    const user = await registerUser(app, { name: "Smoke" });
    expect(user.accessToken).toEqual(expect.any(String));
    expect(user.refreshToken).toEqual(expect.any(String));

    const me = await request(app.getHttpServer())
      .get(`/${API_PREFIX}/auth/me`)
      .set(authHeader(user))
      .expect(200);
    expect(me.body.email).toBe(user.email);
  });

  it("/me sem token → 401", async () => {
    await request(app.getHttpServer()).get(`/${API_PREFIX}/auth/me`).expect(401);
  });
});
