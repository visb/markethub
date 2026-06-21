import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleName } from "@prisma/client";
import { RolesGuard } from "./roles.guard";

function context(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(required: RoleName[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe("RolesGuard", () => {
  it("libera quando a rota não declara roles", () => {
    expect(guardRequiring(undefined).canActivate(context(undefined))).toBe(true);
  });

  it("libera quando a lista de roles é vazia", () => {
    expect(guardRequiring([]).canActivate(context({ id: "u1", email: "a@b.com", roles: [] }))).toBe(true);
  });

  it("libera quando o usuário tem uma das roles exigidas", () => {
    const guard = guardRequiring(["admin"]);
    expect(
      guard.canActivate(context({ id: "u1", email: "a@b.com", roles: ["customer", "admin"] })),
    ).toBe(true);
  });

  it("bloqueia com FORBIDDEN_ROLE quando falta a role", () => {
    const guard = guardRequiring(["admin"]);
    try {
      guard.canActivate(context({ id: "u1", email: "a@b.com", roles: ["customer"] }));
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({ code: "FORBIDDEN_ROLE" });
    }
  });

  it("bloqueia quando não há usuário no request", () => {
    const guard = guardRequiring(["customer"]);
    expect(() => guard.canActivate(context(undefined))).toThrow(ForbiddenException);
  });
});
