import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DevicePlatform } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PUSH_PROVIDER, type PushMessage, type PushProvider } from "./push-provider.interface";

/**
 * Notificações push (S5.6). Registra tokens de device por usuário e envia nos
 * eventos-chave (separação + entrega própria). O provedor (mock/fcm) é injetado
 * por env. Best-effort: falhas não quebram o fluxo de negócio.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  /** Upsert do token de device (chamado no login do app). */
  async registerToken(userId: string, platform: DevicePlatform, token: string) {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, platform, token },
      update: { userId, platform, lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  async removeToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { ok: true };
  }

  /** Envia uma notificação a todos os devices do usuário. Best-effort. */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    try {
      const tokens = await this.prisma.deviceToken.findMany({ where: { userId } });
      if (tokens.length === 0) return;
      const result = await this.provider.send(
        tokens.map((t) => ({ token: t.token, platform: t.platform })),
        message,
      );
      if (result.invalidTokens.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: { token: { in: result.invalidTokens } },
        });
      }
    } catch (err) {
      this.logger.warn(`push p/ ${userId} falhou: ${(err as Error).message}`);
    }
  }
}
