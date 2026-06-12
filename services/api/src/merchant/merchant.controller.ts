import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantService } from "./merchant.service";

class UpdateOfferDto {
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsInt() @Min(0) promoPriceCents?: number | null;
  @IsOptional() @IsBoolean() available?: boolean;
}

class UpdateStockDto {
  @IsOptional() @IsInt() @Min(0) quantity?: number | null;
  @IsOptional() @IsBoolean() available?: boolean;
}

class CreateProductDto {
  @IsString() @MinLength(1) storeId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsIn(["unit", "weight"]) saleType?: "unit" | "weight";
  @IsOptional() @IsString() packageSize?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() gtin?: string;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsInt() @Min(0) promoPriceCents?: number | null;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsInt() @Min(0) quantity?: number | null;
}

class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() brand?: string | null;
  @IsOptional() @IsIn(["unit", "weight"]) saleType?: "unit" | "weight";
  @IsOptional() @IsString() packageSize?: string | null;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsString() categoryId?: string | null;
}

class UploadUrlDto {
  @IsString() @MinLength(1) filename!: string;
  @IsString() @MinLength(1) contentType!: string;
}

@Roles("merchant", "admin")
@Controller("merchant")
export class MerchantController {
  constructor(
    private readonly merchant: MerchantService,
    private readonly products: MerchantProductService,
  ) {}

  @Get("stores")
  stores(@CurrentUser() user: AuthUser) {
    return this.merchant.myStores(user.id);
  }

  // ── Ofertas ──

  @Get("offers")
  listOffers(
    @CurrentUser() user: AuthUser,
    @Query("storeId") storeId?: string,
    @Query("categoryId") categoryId?: string,
    @Query("search") search?: string,
    @Query("available") available?: string,
  ) {
    return this.merchant.listOffers(user.id, {
      storeId,
      categoryId,
      search,
      available: available === undefined ? undefined : available === "true",
    });
  }

  @Patch("offers/:id")
  updateOffer(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateOfferDto) {
    return this.merchant.updateOffer(user.id, id, dto);
  }

  @Delete("offers/:id/locks/:field")
  unlockOffer(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("field") field: string) {
    return this.merchant.unlockOffer(user.id, id, field);
  }

  // ── Estoque ──

  @Get("stocks")
  listStocks(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    return this.merchant.listStocks(user.id, storeId);
  }

  @Patch("stocks/:id")
  updateStock(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateStockDto) {
    return this.merchant.updateStock(user.id, id, dto);
  }

  @Delete("stocks/:id/locks/:field")
  unlockStock(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("field") field: string) {
    return this.merchant.unlockStock(user.id, id, field);
  }

  // ── Produtos (S3.10) ──

  @Post("products/upload-url")
  uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: UploadUrlDto) {
    return this.products.uploadUrl(user.id, dto.filename, dto.contentType);
  }

  @Post("products")
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @Patch("products/:id")
  updateProduct(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(user.id, id, dto);
  }
}
