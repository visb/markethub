import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Env } from "../config/env";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

// TokenService real (mesmos segredos do token.service.spec) — exercita
// sign/verify de JWT e hash/verify do argon2 de verdade, sem rede nem DB.
const envValues: Partial<Env> = {
  JWT_ACCESS_SECRET: "access-secret-0123456789",
  JWT_REFRESH_SECRET: "refresh-secret-0123456789",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "30d",
};
const config = {
  get: (key: keyof Env) => envValues[key],
} as unknown as ConfigService<Env, true>;
const tokens = new TokenService(new JwtService(), config);

interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId?: string | null;
}

/** Fake mínimo do PrismaService. Override substitui o submodelo inteiro. */
function makePrisma(over: Record<string, unknown> = {}) {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: "new-session", userAgent: null }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...over,
  } as never;
}

/** Extrai o body { code, message } de uma UnauthorizedException/ConflictException. */
function errorBody(err: unknown): { code: string; message: string } {
  return (err as UnauthorizedException).getResponse() as { code: string; message: string };
}

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 1_000);

describe("AuthService.register", () => {
  it("rejeita email já cadastrado com EMAIL_TAKEN", async () => {
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue({ id: "u1" }), create: jest.fn() } });
    const svc = new AuthService(prisma, tokens);
    const err = await svc
      .register({ email: "a@b.com", password: "senha-1234", name: "Ana" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(errorBody(err)).toEqual({ code: "EMAIL_TAKEN", message: "Email already registered" });
  });

  it("cria usuário com role padrão customer e emite tokens", async () => {
    const create = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null), create } });
    const svc = new AuthService(prisma, tokens);

    const result = await svc.register({ email: "a@b.com", password: "senha-1234", name: "Ana" });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const roleCreate = create.mock.calls[0][0].data.roles.create;
    expect(roleCreate).toHaveLength(1);
    expect(roleCreate[0].role.connectOrCreate.where.name).toBe("customer");
  });

  it("access token carrega o claim sid da sessão corrente (story 70)", async () => {
    const create = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null), create } });
    const svc = new AuthService(prisma, tokens);

    const result = await svc.register({ email: "a@b.com", password: "senha-1234", name: "Ana" });

    const payload = new JwtService().decode(result.accessToken) as { sid?: string };
    expect(payload.sid).toBe("new-session");
  });

  it("deduplica roles informadas", async () => {
    const create = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null), create } });
    const svc = new AuthService(prisma, tokens);

    await svc.register({
      email: "a@b.com",
      password: "senha-1234",
      name: "Ana",
      roles: ["admin", "admin", "customer"],
    });

    const names = create.mock.calls[0][0].data.roles.create.map(
      (r: { role: { connectOrCreate: { where: { name: string } } } }) =>
        r.role.connectOrCreate.where.name,
    );
    expect(names).toEqual(["admin", "customer"]);
  });
});

describe("AuthService.login", () => {
  async function userWithPassword(password: string, over: Record<string, unknown> = {}) {
    return {
      id: "u1",
      email: "a@b.com",
      passwordHash: await tokens.hash(password),
      active: true,
      roles: [{ role: { name: "customer" } }],
      ...over,
    };
  }

  it("rejeita usuário inexistente com INVALID_CREDENTIALS", async () => {
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } });
    const svc = new AuthService(prisma, tokens);
    const err = await svc.login({ email: "x@y.com", password: "senha-1234" }).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(errorBody(err)).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
  });

  it("rejeita senha errada com INVALID_CREDENTIALS", async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue(await userWithPassword("senha-correta")), create: jest.fn() },
    });
    const svc = new AuthService(prisma, tokens);
    const err = await svc.login({ email: "a@b.com", password: "senha-errada" }).catch((e) => e);
    expect(errorBody(err).code).toBe("INVALID_CREDENTIALS");
  });

  it("rejeita conta desativada com ACCOUNT_DISABLED", async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue(await userWithPassword("senha-1234", { active: false })),
        create: jest.fn(),
      },
    });
    const svc = new AuthService(prisma, tokens);
    const err = await svc.login({ email: "a@b.com", password: "senha-1234" }).catch((e) => e);
    expect(errorBody(err)).toEqual({ code: "ACCOUNT_DISABLED", message: "Conta desativada" });
  });

  it("autentica credenciais válidas e emite access + refresh", async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue(
          await userWithPassword("senha-1234", { roles: [{ role: { name: "admin" } }, { role: { name: "customer" } }] }),
        ),
        create: jest.fn(),
      },
    });
    const svc = new AuthService(prisma, tokens);

    const result = await svc.login({ email: "a@b.com", password: "senha-1234" });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const access = await new JwtService().verifyAsync<{ roles: string[] }>(result.accessToken, {
      secret: envValues.JWT_ACCESS_SECRET,
    });
    expect(access.roles).toEqual(["admin", "customer"]);
  });
});

describe("AuthService.refresh", () => {
  function activeUser(over: Record<string, unknown> = {}) {
    return { id: "u1", email: "a@b.com", active: true, roles: [{ role: { name: "customer" } }], ...over };
  }

  async function validSession(refreshToken: string, over: Partial<SessionRow> = {}): Promise<SessionRow> {
    return {
      id: "sess1",
      userId: "u1",
      refreshTokenHash: await tokens.hash(refreshToken),
      userAgent: "jest",
      expiresAt: future(),
      revokedAt: null,
      ...over,
    };
  }

  it("rejeita token malformado com INVALID_TOKEN", async () => {
    const svc = new AuthService(makePrisma(), tokens);
    const err = await svc.refresh("nao-e-um-jwt").catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(errorBody(err)).toEqual({ code: "INVALID_TOKEN", message: "Invalid refresh token" });
  });

  it("rejeita quando a sessão não existe", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const prisma = makePrisma({ session: { findUnique: jest.fn().mockResolvedValue(null) } });
    const svc = new AuthService(prisma, tokens);
    const err = await svc.refresh(token).catch((e) => e);
    expect(errorBody(err).code).toBe("INVALID_TOKEN");
  });

  it("rejeita quando a sessão pertence a outro usuário", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const prisma = makePrisma({
      session: { findUnique: jest.fn().mockResolvedValue(await validSession(token, { userId: "outro" })) },
    });
    const svc = new AuthService(prisma, tokens);
    expect(errorBody(await svc.refresh(token).catch((e) => e)).code).toBe("INVALID_TOKEN");
  });

  it("detecta reuse de sessão revogada e revoga a cadeia inteira", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = makePrisma({
      session: {
        findUnique: jest.fn().mockResolvedValue(await validSession(token, { revokedAt: new Date() })),
        updateMany,
      },
    });
    const svc = new AuthService(prisma, tokens);
    const err = await svc.refresh(token).catch((e) => e);
    expect(errorBody(err).code).toBe("INVALID_TOKEN");
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rejeita sessão expirada com INVALID_TOKEN", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const prisma = makePrisma({
      session: { findUnique: jest.fn().mockResolvedValue(await validSession(token, { expiresAt: past() })) },
    });
    const svc = new AuthService(prisma, tokens);
    expect(errorBody(await svc.refresh(token).catch((e) => e)).code).toBe("INVALID_TOKEN");
  });

  it("rejeita quando o hash do refresh não confere", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const outroHash = await tokens.hash("outro-token-qualquer");
    const prisma = makePrisma({
      session: {
        findUnique: jest.fn().mockResolvedValue(await validSession(token, { refreshTokenHash: outroHash })),
      },
    });
    const svc = new AuthService(prisma, tokens);
    expect(errorBody(await svc.refresh(token).catch((e) => e)).code).toBe("INVALID_TOKEN");
  });

  it("rejeita quando o usuário foi desativado", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const prisma = makePrisma({
      session: { findUnique: jest.fn().mockResolvedValue(await validSession(token)) },
      user: { findUnique: jest.fn().mockResolvedValue(activeUser({ active: false })), create: jest.fn() },
    });
    const svc = new AuthService(prisma, tokens);
    expect(errorBody(await svc.refresh(token).catch((e) => e)).code).toBe("INVALID_TOKEN");
  });

  it("rotaciona a sessão num refresh válido", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const update = jest.fn().mockResolvedValue({});
    const prisma = makePrisma({
      session: {
        findUnique: jest.fn().mockResolvedValue(await validSession(token)),
        create: jest.fn().mockResolvedValue({ id: "sess2", userAgent: null }),
        update,
      },
      user: { findUnique: jest.fn().mockResolvedValue(activeUser()), create: jest.fn() },
    });
    const svc = new AuthService(prisma, tokens);

    const result = await svc.refresh(token, "novo-agent");

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    // última chamada: revoga a sessão antiga apontando p/ a nova.
    expect(update).toHaveBeenCalledWith({
      where: { id: "sess1" },
      data: { revokedAt: expect.any(Date), replacedBySessionId: "sess2" },
    });
  });
});

describe("AuthService.logout", () => {
  it("revoga a sessão de um refresh válido", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ session: { updateMany } });
    const svc = new AuthService(prisma, tokens);

    await svc.logout(token);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sess1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("é no-op idempotente para token inválido", async () => {
    const updateMany = jest.fn();
    const prisma = makePrisma({ session: { updateMany } });
    const svc = new AuthService(prisma, tokens);

    await expect(svc.logout("token-invalido")).resolves.toBeUndefined();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("desliga o turno do entregador no logout (story 62): limpa driverAvailableAt só p/ driver", async () => {
    const token = await tokens.signRefresh({ sub: "u1", sid: "sess1" });
    const userUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({
      session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { updateMany: userUpdateMany },
    });
    const svc = new AuthService(prisma, tokens);

    await svc.logout(token);

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "u1", roles: { some: { role: { name: "driver" } } } },
      data: { driverAvailableAt: null },
    });
  });
});

describe("AuthService.me", () => {
  it("retorna identidade, phone e roles do usuário (story 70)", async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          email: "a@b.com",
          name: "Ana",
          phone: "41999991234",
          roles: [{ role: { name: "customer" } }, { role: { name: "admin" } }],
        }),
        create: jest.fn(),
      },
    });
    const svc = new AuthService(prisma, tokens);

    await expect(svc.me("u1")).resolves.toEqual({
      id: "u1",
      email: "a@b.com",
      name: "Ana",
      phone: "41999991234",
      roles: ["customer", "admin"],
    });
  });

  it("phone null aparece como null (sem telefone cadastrado)", async () => {
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u1",
          email: "a@b.com",
          name: "Ana",
          phone: null,
          roles: [{ role: { name: "customer" } }],
        }),
        create: jest.fn(),
      },
    });
    const svc = new AuthService(prisma, tokens);
    await expect(svc.me("u1")).resolves.toMatchObject({ phone: null });
  });

  it("rejeita usuário inexistente com INVALID_TOKEN", async () => {
    const prisma = makePrisma({ user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } });
    const svc = new AuthService(prisma, tokens);
    expect(errorBody(await svc.me("u1").catch((e) => e)).code).toBe("INVALID_TOKEN");
  });
});
