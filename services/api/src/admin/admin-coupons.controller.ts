import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { Roles } from "../auth";
import { COUPON_TYPES } from "../shared/coupon-rules";
import { AdminCouponsService } from "./admin-coupons.service";

class AdminCreateCouponDto {
  @IsString() @MinLength(1) code!: string;
  @IsIn(COUPON_TYPES) type!: (typeof COUPON_TYPES)[number];
  @IsInt() value!: number;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number | null;
  @IsOptional() @IsISO8601() validFrom?: string | null;
  @IsOptional() @IsISO8601() validTo?: string | null;
  @IsOptional() @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
  /** null/ausente = cupom global; id = cupom da rede. */
  @IsOptional() @IsString() merchantId?: string | null;
}

class AdminUpdateCouponDto {
  @IsOptional() @IsIn(COUPON_TYPES) type?: (typeof COUPON_TYPES)[number];
  @IsOptional() @IsInt() value?: number;
  @IsOptional() @IsInt() @Min(0) minOrderCents?: number | null;
  @IsOptional() @IsISO8601() validFrom?: string | null;
  @IsOptional() @IsISO8601() validTo?: string | null;
  @IsOptional() @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** CRUD de cupons (globais + por rede) pelo admin. Somente admin. */
@Roles("admin")
@Controller("admin/coupons")
export class AdminCouponsController {
  constructor(private readonly coupons: AdminCouponsService) {}

  @Get()
  list(@Query("merchantId") merchantId?: string) {
    return this.coupons.list(merchantId);
  }

  @Post()
  create(@Body() dto: AdminCreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: AdminUpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.coupons.remove(id);
  }
}
