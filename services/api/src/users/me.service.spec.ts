import { BadRequestException, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { MeService } from "./me.service";

/**
 * Story 70: self-service da conta (users/me).
 * - updateProfile: PATCH parcial — undefined não toca, null limpa o phone,
 *   PATCH vazio não escreve no banco.
 * - changePassword: senha atual errada nega (INVALID_CURRENT_PASSWORD), rehash
 *   argon2 valida login com a senha nova, sessões alheias revogadas e a corrente
 *   sobrevive (claim sid); token legado sem sid revoga tudo.
 */

const PROFILE_ROW = {
  id: "u1",
  name: "Ana",
  email: "a@b.com",
  phone: "41999991234",
  roles: [{ role: { name: "customer" } }],
};

function makePrisma(over: Record<string, unknown> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(PROFILE_ROW),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...PROFILE_ROW, ...data }),
      ),
    },
    session: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...over,
  };
  return prisma;
}

function errorBody(err: unknown): { code: string; message: string } {
  return (err as BadRequestException).getResponse() as { code: string; message: string };
}

describe("MeService.updateProfile", () => {
  it("PATCH parcial: só name enviado → phone não entra no update", async () => {
    const prisma = makePrisma();
    const svc = new MeService(prisma as never);

    const out = await svc.updateProfile("u1", { name: "Ana Maria" });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: "Ana Maria" });
    expect("phone" in data).toBe(false); // undefined NÃO toca
    expect(out).toEqual({
      id: "u1",
      name: "Ana Maria",
      email: "a@b.com",
      phone: "41999991234",
      roles: ["customer"],
    });
  });

  it("PATCH parcial: só phone enviado → name não entra no update", async () => {
    const prisma = makePrisma();
    const svc = new MeService(prisma as never);

    await svc.updateProfile("u1", { phone: "4133334444" });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toEqual({ phone: "4133334444" });
    expect("name" in data).toBe(false);
  });

  it("phone: null limpa o telefone (null ≠ undefined)", async () => {
    const prisma = makePrisma();
    const svc = new MeService(prisma as never);

    const out = await svc.updateProfile("u1", { phone: null });

    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ phone: null });
    expect(out.phone).toBeNull();
  });

  it("PATCH vazio: não escreve no banco e devolve o perfil corrente", async () => {
    const prisma = makePrisma();
    const svc = new MeService(prisma as never);

    const out = await svc.updateProfile("u1", {});

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(out).toEqual({
      id: "u1",
      name: "Ana",
      email: "a@b.com",
      phone: "41999991234",
      roles: ["customer"],
    });
  });

  it("usuário inexistente → USER_NOT_FOUND", async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    });
    const svc = new MeService(prisma as never);

    const err = await svc.updateProfile("ghost", { name: "X" }).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(errorBody(err).code).toBe("USER_NOT_FOUND");
  });
});

describe("MeService.changePassword", () => {
  async function makeWithPassword(current: string, over: Record<string, unknown> = {}) {
    const passwordHash = await argon2.hash(current);
    const prisma = makePrisma({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "u1", passwordHash }),
        update: jest.fn().mockResolvedValue({}),
      },
      ...over,
    });
    return { prisma, svc: new MeService(prisma as never) };
  }

  it("senha atual errada → INVALID_CURRENT_PASSWORD (400, sem tocar nada)", async () => {
    const { prisma, svc } = await makeWithPassword("senha-atual-1");

    const err = await svc
      .changePassword("u1", "sess-1", { currentPassword: "errada-9999", newPassword: "nova-senha-1" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(errorBody(err).code).toBe("INVALID_CURRENT_PASSWORD");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("rehash: o hash gravado valida a senha NOVA (login novo funciona)", async () => {
    const { prisma, svc } = await makeWithPassword("senha-atual-1");

    const out = await svc.changePassword("u1", "sess-1", {
      currentPassword: "senha-atual-1",
      newPassword: "nova-senha-1",
    });

    expect(out).toEqual({ ok: true, revokedSessions: 2 });
    const newHash = prisma.user.update.mock.calls[0][0].data.passwordHash as string;
    await expect(argon2.verify(newHash, "nova-senha-1")).resolves.toBe(true);
    await expect(argon2.verify(newHash, "senha-atual-1")).resolves.toBe(false);
  });

  it("revoga as sessões alheias e a corrente sobrevive (id not sessionId)", async () => {
    const { prisma, svc } = await makeWithPassword("senha-atual-1");

    await svc.changePassword("u1", "sess-atual", {
      currentPassword: "senha-atual-1",
      newPassword: "nova-senha-1",
    });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null, id: { not: "sess-atual" } },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("token legado sem sid: revoga TODAS as sessões ativas do usuário", async () => {
    const { prisma, svc } = await makeWithPassword("senha-atual-1");

    await svc.changePassword("u1", undefined, {
      currentPassword: "senha-atual-1",
      newPassword: "nova-senha-1",
    });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("usuário inexistente → USER_NOT_FOUND", async () => {
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    });
    const svc = new MeService(prisma as never);

    const err = await svc
      .changePassword("ghost", undefined, { currentPassword: "x", newPassword: "nova-senha-1" })
      .catch((e) => e);
    expect(errorBody(err).code).toBe("USER_NOT_FOUND");
  });
});
