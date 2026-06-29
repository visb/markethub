import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Seguir loja (story 34): espelha o módulo `favorites`, mas referencia a LOJA
 * (`storeId`) em vez da oferta. Idempotente via `@@unique([userId, storeId])`.
 */
@Injectable()
export class StoreFollowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Segue a loja (upsert idempotente). Loja inexistente → STORE_NOT_FOUND. */
  async follow(userId: string, storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Loja não encontrada" });
    }
    return this.prisma.storeFollow.upsert({
      where: { userId_storeId: { userId, storeId } },
      update: {},
      create: { userId, storeId },
    });
  }

  /** Deixa de seguir (idempotente via deleteMany). */
  async unfollow(userId: string, storeId: string) {
    await this.prisma.storeFollow.deleteMany({ where: { userId, storeId } });
    return { storeId, removed: true };
  }

  /** Lojas seguidas pelo usuário, com nome/logo da rede, mais recentes primeiro. */
  async list(userId: string) {
    const rows = await this.prisma.storeFollow.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            merchant: { select: { name: true, logoUrl: true } },
          },
        },
      },
    });
    return rows.map((f) => ({
      storeId: f.storeId,
      createdAt: f.createdAt.toISOString(),
      store: {
        id: f.store.id,
        name: f.store.name,
        merchantName: f.store.merchant.name,
        merchantLogoUrl: f.store.merchant.logoUrl,
      },
    }));
  }

  /** Se o usuário segue a loja (reutilizado pelas sections da vitrine). */
  async isFollowing(userId: string, storeId: string): Promise<boolean> {
    const row = await this.prisma.storeFollow.findUnique({
      where: { userId_storeId: { userId, storeId } },
    });
    return row != null;
  }
}
