import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { ReviewsModerationService } from "../reviews";

class HideReviewDto {
  /** Motivo obrigatório (trilha de por quê) — decisão travada da story 68. */
  @IsString() @MinLength(1) reason!: string;
}

/**
 * Moderação de avaliações (story 68). Somente admin. Controller fino: parseia
 * filtros e delega ao contexto engagement via barrel (dono do model Review).
 * Soft-hide reversível — nunca deleta; autor não é notificado.
 */
@Roles("admin")
@Controller("admin/reviews")
export class AdminReviewsController {
  constructor(private readonly moderation: ReviewsModerationService) {}

  @Get("list")
  list(
    @Query("rating") rating?: string,
    @Query("hidden") hidden?: string,
    @Query("merchantId") merchantId?: string,
    @Query("q") q?: string,
  ) {
    return this.moderation.list({
      rating: rating ? Number(rating) : undefined,
      hidden: hidden === "true" ? true : hidden === "false" ? false : undefined,
      merchantId: merchantId || undefined,
      q: q || undefined,
    });
  }

  @Post(":id/hide")
  hide(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: HideReviewDto) {
    return this.moderation.hide(id, user.id, dto.reason);
  }

  @Post(":id/unhide")
  unhide(@Param("id") id: string) {
    return this.moderation.unhide(id);
  }
}
