import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { CurrentUser } from "../auth";
import type { AuthUser } from "../auth";
import { MerchantReviewsService } from "./merchant-reviews.service";

class ReplyReviewDto {
  @IsString() @Length(1, 1000) text!: string;
}

/**
 * Avaliações da rede no app merchant (story 56). Sem `@Roles` de classe (como os
 * demais controllers do merchant): a capability `reviews.manage` (owner/admin) e
 * o escopo de rede são reforçados no `MerchantReviewsService` — a tela nunca é a
 * fonte da verdade.
 */
@Controller("merchant/reviews")
export class MerchantReviewsController {
  constructor(private readonly reviews: MerchantReviewsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("rating") rating?: string,
    @Query("unanswered") unanswered?: string,
  ) {
    const parsedRating = rating ? Number(rating) : undefined;
    return this.reviews.list(
      { id: user.id, roles: user.roles },
      {
        rating: parsedRating && Number.isInteger(parsedRating) ? parsedRating : undefined,
        unanswered: unanswered === "true" || unanswered === "1",
      },
    );
  }

  @Post(":id/reply")
  reply(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ReplyReviewDto) {
    return this.reviews.reply({ id: user.id, roles: user.roles }, id, dto.text);
  }
}
