import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { RoleName, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthTokens, AuthUser } from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { TokenService } from "./token.service";

const DEFAULT_ROLE: RoleName = "customer";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ code: "EMAIL_TAKEN", message: "Email already registered" });
    }

    const passwordHash = await this.tokens.hash(dto.password);
    const roleNames = dto.roles?.length ? dedupe(dto.roles) : [DEFAULT_ROLE];

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        roles: {
          create: roleNames.map((name) => ({
            role: {
              connectOrCreate: { where: { name }, create: { name } },
            },
          })),
        },
      },
    });

    return this.issueSession({ id: user.id, email: user.email, roles: roleNames }, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw this.invalidCredentials();

    const ok = await this.tokens.verifyHash(user.passwordHash, dto.password);
    if (!ok) throw this.invalidCredentials();
    if (!user.active) throw this.accountDisabled();

    const roles = user.roles.map((r) => r.role.name);
    return this.issueSession({ id: user.id, email: user.email, roles }, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthTokens> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw this.invalidToken();
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub) throw this.invalidToken();

    // Sessão revogada mas token ainda válido = reuse. Revoga a cadeia inteira do usuário.
    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw this.invalidToken();
    }
    if (session.expiresAt < new Date()) throw this.invalidToken();

    const matches = await this.tokens.verifyHash(session.refreshTokenHash, refreshToken);
    if (!matches) throw this.invalidToken();

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.active) throw this.invalidToken();
    const roles = user.roles.map((r) => r.role.name);

    // Rotação: cria nova sessão e revoga a antiga, apontando para a nova.
    const { tokens, sessionId } = await this.issueSessionWithId(
      { id: user.id, email: user.email, roles },
      userAgent ?? session.userAgent ?? undefined,
    );
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedBySessionId: sessionId },
    });
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.tokens.verifyRefresh(refreshToken);
      await this.prisma.session.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Turno on/off (story 62): logout desliga o turno do entregador. Escopado
      // à role driver — no-op para os demais (single query, sem passo extra).
      await this.prisma.user.updateMany({
        where: { id: payload.sub, roles: { some: { role: { name: "driver" } } } },
        data: { driverAvailableAt: null },
      });
    } catch {
      // Token inválido no logout é no-op idempotente.
    }
  }

  async me(userId: string): Promise<AuthUser & { name: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw this.invalidToken();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((r) => r.role.name),
    };
  }

  private async issueSession(
    user: Pick<User, "id" | "email"> & { roles: RoleName[] },
    userAgent?: string,
  ): Promise<AuthTokens> {
    const { tokens } = await this.issueSessionWithId(user, userAgent);
    return tokens;
  }

  private async issueSessionWithId(
    user: Pick<User, "id" | "email"> & { roles: RoleName[] },
    userAgent?: string,
  ): Promise<{ tokens: AuthTokens; sessionId: string }> {
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: "",
        userAgent: userAgent ?? null,
        expiresAt: this.tokens.refreshExpiry(),
      },
    });

    const accessToken = await this.tokens.signAccess({
      sub: user.id,
      email: user.email,
      roles: user.roles,
    });
    const refreshToken = await this.tokens.signRefresh({ sub: user.id, sid: session.id });

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: await this.tokens.hash(refreshToken) },
    });

    return { tokens: { accessToken, refreshToken }, sessionId: session.id };
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
    });
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException({ code: "INVALID_TOKEN", message: "Invalid refresh token" });
  }

  private accountDisabled(): UnauthorizedException {
    return new UnauthorizedException({ code: "ACCOUNT_DISABLED", message: "Conta desativada" });
  }
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
