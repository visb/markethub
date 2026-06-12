import type { INestApplication } from "@nestjs/common";
import type { RoleName } from "@prisma/client";
import request from "supertest";
import { API_PREFIX } from "./app";

export interface TestUser {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

let seq = 0;

/**
 * Registra um usuário via endpoint real e devolve os tokens emitidos.
 * Email único por chamada para não colidir entre specs. Sem `roles` => customer.
 */
export async function registerUser(
  app: INestApplication,
  overrides: { email?: string; password?: string; name?: string; roles?: RoleName[] } = {},
): Promise<TestUser> {
  const password = overrides.password ?? "Passw0rd!";
  const email = overrides.email ?? `e2e-${Date.now()}-${seq++}@test.dev`;

  const res = await request(app.getHttpServer())
    .post(`/${API_PREFIX}/auth/register`)
    .send({ email, password, name: overrides.name ?? "E2E User", roles: overrides.roles })
    .expect(201);

  return {
    email,
    password,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

/** Header Authorization Bearer para usar em requests autenticados. */
export function authHeader(user: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${user.accessToken}` };
}
