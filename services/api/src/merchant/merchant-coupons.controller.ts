import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth";
import type { AuthUser } from "../auth";
import { COUPON_TYPES } from "../shared/coupon-rules";
import { MerchantCouponsService } from "./merchant-coupons.service";

class CreateCouponDto {
  @IsString() @MinLength(1) code!: string;
  /** Título legível (obrigatório na criação — story 73). */
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsIn(COUPON_TYPES) type!: (typeof COUPON_TYPES)[number];
  @IsInt() value!: number;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number | null;
  @IsOptional() @IsISO8601() validFrom?: string | null;
  @IsOptional() @IsISO8601() validTo?: string | null;
  @IsOptional() @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() merchantId?: string;
}

class UpdateCouponDto {
  @IsOptional() @IsString() @IsNotEmpty() title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(COUPON_TYPES) type?: (typeof COUPON_TYPES)[number];
  @IsOptional() @IsInt() value?: number;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number | null;
  @IsOptional() @IsISO8601() validFrom?: string | null;
  @IsOptional() @IsISO8601() validTo?: string | null;
  @IsOptional() @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

/**
 * Cupons da rede (story 53). Sem `@Roles` de classe (como os demais controllers do
 * merchant): a autorização fina (owner/admin vs manager) e o escopo de rede são
 * reforçados no `MerchantCouponsService` — a tela nunca é a fonte da verdade.
 */
@Controller("merchant/coupons")
export class MerchantCouponsController {
  constructor(private readonly coupons: MerchantCouponsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("merchantId") merchantId?: string) {
    return this.coupons.list({ id: user.id, roles: user.roles }, merchantId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCouponDto) {
    return this.coupons.create({ id: user.id, roles: user.roles }, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update({ id: user.id, roles: user.roles }, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.coupons.remove({ id: user.id, roles: user.roles }, id);
  }
}
