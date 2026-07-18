import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import type { TipTarget } from "@prisma/client";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { ReviewsService } from "./reviews.service";
import { TipsService } from "./tips.service";

class CreateReviewDto {
  @IsIn(["platform", "delivery", "merchant"]) axis!: "platform" | "delivery" | "merchant";
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
  /** Eixo merchant em pedido multi-loja: qual mercado está sendo avaliado. */
  @IsOptional() @IsString() merchantId?: string;
}

/** Um item da gorjeta multi-alvo (story 77). */
class TipItemDto {
  @IsIn(["platform", "driver", "merchant"]) target!: TipTarget;
  /** merchant → merchantId; platform/driver dispensam (driver resolvido no pedido). */
  @IsOptional() @IsString() targetId?: string;
  @IsInt() @Min(1) amountCents!: number;
}

class CreateTipDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TipItemDto)
  items!: TipItemDto[];
}

/** Avaliações e gorjeta do cliente após a entrega (S5.2). */
@Roles("customer")
@Controller("orders/:orderId")
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly tips: TipsService,
  ) {}

  @Get("reviews")
  list(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.reviews.listForOrder(user.id, orderId);
  }

  @Post("reviews")
  create(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, orderId, dto);
  }

  @Get("tip")
  getTip(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.tips.get(user.id, orderId);
  }

  @Get("tip/targets")
  tipTargets(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.tips.targets(user.id, orderId);
  }

  @Post("tip")
  createTip(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Body() dto: CreateTipDto,
  ) {
    return this.tips.create(user.id, orderId, dto.items);
  }

  @Post("tip/mock-pay")
  mockPayTip(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.tips.mockPay(user.id, orderId);
  }
}
