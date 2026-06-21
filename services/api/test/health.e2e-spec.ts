import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";

/**
 * Smoke do harness e2e: prova que a app sobe, o prefixo global funciona
 * e o banco de teste responde (check `database: up`).
 */
describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health → 200 ok com database up", async () => {
    const res = await request(app.getHttpServer()).get(`/${API_PREFIX}/health`).expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.database).toBe("up");
  });
});
