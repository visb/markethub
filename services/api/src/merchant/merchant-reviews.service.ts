import { ForbiddenException, Injectable } from "@nestjs/common";
import { ReviewsManagementService } from "../reviews";
import { MerchantService } from "./merchant.service";

/**
 * Gestão de avaliações da REDE pelo app merchant (story 56). O review tem alvo
 * `targetMerchantId` (a rede, não a loja física) — logo é gestão de nível
 * owner/administrador (capability `reviews.manage`, fora do alcance do gerente).
 *
 * O escopo e a autorização vivem AQUI (contexto merchant); o acesso ao model
 * `Review` é delegado ao `ReviewsManagementService` (contexto engagement) via
 * barrel público — este service nunca toca o Prisma de reviews direto.
 */
@Injectable()
export class MerchantReviewsService {
  constructor(
    private readonly merchant: MerchantService,
    private readonly reviews: ReviewsManagementService,
  ) {}

  /** owner/admin gerenciam avaliações; gerente de loja (manager) → FORBIDDEN. */
  private async assertCanManage(user: { id: string; roles: string[] }): Promise<void> {
    const level = await this.merchant.resolveLevel(user);
    if (level === "manager") {
      throw new ForbiddenException({
        code: "REVIEWS_FORBIDDEN",
        message: "Apenas dono ou administrador da rede gerenciam avaliações",
      });
    }
  }

  /** Redes no escopo do usuário (posse de loja = StoreStaff admin/manager). */
  private async scopedMerchantIds(user: { id: string; roles: string[] }): Promise<string[]> {
    return (await this.merchant.scopedStores(user)).merchantIds;
  }

  /** Lista as avaliações (eixo merchant) das redes do escopo, com comentários. */
  async list(
    user: { id: string; roles: string[] },
    filter: { rating?: number; unanswered?: boolean },
  ) {
    await this.assertCanManage(user);
    const merchantIds = await this.scopedMerchantIds(user);
    return this.reviews.listForManagement(merchantIds, filter);
  }

  /** Responde/reedita uma avaliação da rede do lojista (alvo alheio → 404). */
  async reply(user: { id: string; roles: string[] }, reviewId: string, text: string) {
    await this.assertCanManage(user);
    const merchantIds = await this.scopedMerchantIds(user);
    return this.reviews.reply(merchantIds, reviewId, text);
  }
}
