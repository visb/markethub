import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, RoleName } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";

/** Shape do perfil devolvido pelo PATCH users/me — espelha o GET auth/me. */
export interface MeProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: RoleName[];
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

/**
 * Self-service da conta do usuário autenticado (story 70): editar nome/telefone
 * (PATCH parcial — undefined não toca, null limpa o phone) e trocar a senha
 * (verifica a atual, rehash argon2 e revoga as demais sessões preservando a
 * corrente). E-mail NÃO é editável — é a identidade de login.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(
    userId: string,
    patch: { name?: string; phone?: string | null },
  ): Promise<MeProfile> {
    const data: Prisma.UserUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.phone !== undefined) data.phone = patch.phone;

    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!current) throw this.userNotFound();

    // PATCH vazio: não toca o banco além da leitura — devolve o perfil corrente.
    if (Object.keys(data).length === 0) return this.toProfile(current);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
    return this.toProfile(user);
  }

  /**
   * Troca de senha: exige a senha atual (INVALID_CURRENT_PASSWORD — 400, não 401,
   * p/ não disparar o refresh automático do ApiClient), rehash argon2 e revogação
   * de TODAS as outras sessões ativas do usuário. A sessão corrente
   * (`currentSessionId`, claim `sid` do access token) sobrevive; token legado sem
   * `sid` revoga tudo — o usuário reloga.
   */
  async changePassword(
    userId: string,
    currentSessionId: string | undefined,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ ok: boolean; revokedSessions: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw this.userNotFound();

    const ok = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!ok) {
      throw new BadRequestException({
        code: "INVALID_CURRENT_PASSWORD",
        message: "Senha atual incorreta",
      });
    }

    const passwordHash = await argon2.hash(input.newPassword);
    const [, revoked] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
        },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true, revokedSessions: revoked.count };
  }

  private toProfile(user: ProfileRow): MeProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles.map((r) => r.role.name),
    };
  }

  private userNotFound(): NotFoundException {
    return new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found" });
  }
}
