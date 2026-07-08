import { Inject, Injectable, Logger } from "@nestjs/common";
import type { DevicePlatform } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PUSH_PROVIDER, type PushMessage, type PushProvider } from "./push-provider.interface";
import { PushQueueService } from "./push.queue";

/**
 * Notificações push (S5.6). Registra tokens de device por usuário e envia nos
 * eventos-chave (separação + entrega própria). O provedor (mock/fcm) é injetado
 * por env. Best-effort: falhas não quebram o fluxo de negócio.
 *
 * Story 49: `sendToUser` enfileira em BullMQ (fila `push`) em vez de chamar o
 * provedor inline — tira a latência do FCM do caminho quente de handoff/
 * substituição/entrega e ganha retry leve. O envio real vive em `deliverToUser`,
 * executado pelo PushProcessor.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    private readonly pushQueue: PushQueueService,
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

  /**
   * Enfileira uma notificação a todos os devices do usuário. Best-effort: falha
   * no enqueue (Redis fora) é logada e engolida — não quebra o fluxo de negócio.
   */
  async sendToUser(userId: string, message: PushMessage): Promise<void> {
    try {
      await this.pushQueue.enqueue(userId, message);
    } catch (err) {
      this.logger.warn(`enqueue de push p/ ${userId} falhou: ${(err as Error).message}`);
    }
  }

  /**
   * Envio real (chamado pelo PushProcessor): busca tokens → provedor → remove
   * tokens inválidos. Falha PROPAGA para o BullMQ retentar (retry leve com
   * descarte — ver PUSH_JOB_OPTS).
   */
  async deliverToUser(userId: string, message: PushMessage): Promise<void> {
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
  }
}
