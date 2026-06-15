import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth";
import { apiErrorSchema } from "./error";
import { ROLE_NAMES, roleNameSchema } from "./roles";

/**
 * C29: contratos zod compartilhados (packages/types). Garante que o schema
 * aceita o payload válido e rejeita o inválido — o mesmo schema é usado pelos
 * apps e espelha o DTO da API.
 */
describe("registerSchema", () => {
  it("aceita payload válido", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "segredo12", name: "Ana" });
    expect(r.success).toBe(true);
  });

  it("rejeita email inválido", () => {
    expect(registerSchema.safeParse({ email: "nao-email", password: "segredo12", name: "Ana" }).success).toBe(false);
  });

  it("rejeita senha curta (< 8)", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "123", name: "Ana" }).success).toBe(false);
  });

  it("roles é opcional, mas valida o enum quando presente", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "segredo12", name: "Ana", roles: ["admin"] }).success).toBe(true);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "segredo12", name: "Ana", roles: ["root"] }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("exige email válido e senha não-vazia", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("roleNameSchema / ROLE_NAMES", () => {
  it("expõe exatamente os 5 papéis", () => {
    expect(ROLE_NAMES).toEqual(["customer", "picker", "driver", "merchant", "admin"]);
  });
  it("valida papel conhecido e rejeita desconhecido", () => {
    expect(roleNameSchema.safeParse("picker").success).toBe(true);
    expect(roleNameSchema.safeParse("ceo").success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("exige code e message; details/path/timestamp opcionais", () => {
    expect(apiErrorSchema.safeParse({ code: "X", message: "y" }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ code: "X", message: "y", details: { a: 1 }, path: "/x" }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ message: "sem code" }).success).toBe(false);
  });
});
