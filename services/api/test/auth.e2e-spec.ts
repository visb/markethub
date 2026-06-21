import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";

/**
 * Fluxo de auth ponta a ponta (C10): register → /me, login (ok/erro),
 * refresh (rotação + reuso) e o RolesGuard num endpoint admin.
 */
describe("Auth (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  describe("register + /me", () => {
    it("register emite tokens e /me retorna o usuário", async () => {
      const user = await registerUser(app, { name: "Smoke" });
      expect(user.accessToken).toEqual(expect.any(String));
      expect(user.refreshToken).toEqual(expect.any(String));

      const me = await request(app.getHttpServer())
        .get(url("/auth/me"))
        .set(authHeader(user))
        .expect(200);
      expect(me.body.email).toBe(user.email);
    });

    it("/me sem token → 401", async () => {
      await request(app.getHttpServer()).get(url("/auth/me")).expect(401);
    });
  });

  describe("login", () => {
    it("credenciais corretas → tokens válidos", async () => {
      const user = await registerUser(app);
      const res = await request(app.getHttpServer())
        .post(url("/auth/login"))
        .send({ email: user.email, password: user.password })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .get(url("/auth/me"))
        .set({ Authorization: `Bearer ${res.body.accessToken}` })
        .expect(200);
    });

    it("senha errada → 401", async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer())
        .post(url("/auth/login"))
        .send({ email: user.email, password: "errada-123" })
        .expect(401);
    });
  });

  describe("refresh", () => {
    it("refresh válido emite novo access token utilizável", async () => {
      const user = await registerUser(app);
      const res = await request(app.getHttpServer())
        .post(url("/auth/refresh"))
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));

      await request(app.getHttpServer())
        .get(url("/auth/me"))
        .set({ Authorization: `Bearer ${res.body.accessToken}` })
        .expect(200);
    });

    it("reuso do refresh antigo após rotação → 401", async () => {
      const user = await registerUser(app);
      await request(app.getHttpServer())
        .post(url("/auth/refresh"))
        .send({ refreshToken: user.refreshToken })
        .expect(200);
      // o mesmo refresh token já foi rotacionado
      await request(app.getHttpServer())
        .post(url("/auth/refresh"))
        .send({ refreshToken: user.refreshToken })
        .expect(401);
    });
  });

  describe("RolesGuard (admin/merchants)", () => {
    it("customer → 403", async () => {
      const customer = await registerUser(app);
      await request(app.getHttpServer())
        .get(url("/admin/merchants"))
        .set(authHeader(customer))
        .expect(403);
    });

    it("admin → 200", async () => {
      const admin = await registerUser(app, { roles: ["admin"] });
      await request(app.getHttpServer())
        .get(url("/admin/merchants"))
        .set(authHeader(admin))
        .expect(200);
    });
  });
});
