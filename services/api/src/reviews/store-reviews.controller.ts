import { BadRequestException, Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../auth";
import { ReviewsManagementService } from "./reviews-management.service";

/**
 * Vitrine pública de avaliações da rede (story 56) — alinhada aos endpoints de
 * vitrine do catálogo (`@Public`, somente leitura). Hoje só o eixo `merchant`
 * é exposto (avaliação da rede); `axis` fica no contrato p/ evolução futura.
 */
@Public()
@Controller("merchants/:merchantId/reviews")
export class StoreReviewsController {
  constructor(private readonly reviews: ReviewsManagementService) {}

  @Get()
  list(
    @Param("merchantId") merchantId: string,
    @Query("axis") axis = "merchant",
    @Query("page") page?: string,
  ) {
    if (axis !== "merchant") {
      throw new BadRequestException({
        code: "UNSUPPORTED_AXIS",
        message: "Só o eixo merchant é exposto na vitrine",
      });
    }
    const parsed = page ? Number(page) : 1;
    return this.reviews.storeReviews(merchantId, Number.isFinite(parsed) ? parsed : 1);
  }
}
