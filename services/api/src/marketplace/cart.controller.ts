import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { CartService } from "./cart.service";

class AddItemDto {
  @IsString() offerId!: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsInt() @Min(1) weightGrams?: number | null;
  @IsOptional() @IsString() note?: string | null;
}

class UpdateItemDto {
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsInt() @Min(1) weightGrams?: number | null;
  @IsOptional() @IsString() note?: string | null;
}

class CouponDto {
  @IsString() @MinLength(1) code!: string;
}

@Roles("customer")
@Controller("cart")
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.cart.getCart(user.id);
  }

  @Post("items")
  add(@CurrentUser() user: AuthUser, @Body() dto: AddItemDto) {
    return this.cart.addItem(user.id, dto);
  }

  @Patch("items/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateItemDto) {
    return this.cart.updateItem(user.id, id, dto);
  }

  @Delete("items/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cart.removeItem(user.id, id);
  }

  @Delete()
  clear(@CurrentUser() user: AuthUser) {
    return this.cart.clear(user.id);
  }

  @Get("coupons")
  availableCoupons(@CurrentUser() user: AuthUser) {
    return this.cart.availableCoupons(user.id);
  }

  @Post("coupon")
  applyCoupon(@CurrentUser() user: AuthUser, @Body() dto: CouponDto) {
    return this.cart.applyCoupon(user.id, dto.code);
  }

  @Delete("coupon")
  removeCoupon(@CurrentUser() user: AuthUser) {
    return this.cart.removeCoupon(user.id);
  }
}
