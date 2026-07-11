import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantService } from "./merchant.service";

class CreateStoreDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() merchantId?: string;
  @IsOptional() @IsString() externalId?: string | null;
  @IsOptional() @IsString() street?: string | null;
  @IsOptional() @IsString() number?: string | null;
  @IsOptional() @IsString() district?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() state?: string | null;
  @IsOptional() @IsString() zipCode?: string | null;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  @IsOptional() @IsInt() @Min(0) avgPrepMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateStoreDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() externalId?: string | null;
  @IsOptional() @IsString() street?: string | null;
  @IsOptional() @IsString() number?: string | null;
  @IsOptional() @IsString() district?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() state?: string | null;
  @IsOptional() @IsString() zipCode?: string | null;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  @IsOptional() @IsInt() @Min(0) avgPrepMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** Uma faixa abre–fecha de um dia (minutos desde a meia-noite) — story 52. */
class StoreHoursEntryDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsInt() @Min(0) @Max(1439) opensAt!: number;
  @IsInt() @Min(1) @Max(1440) closesAt!: number;
}

class SetStoreHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreHoursEntryDto)
  hours!: StoreHoursEntryDto[];
}

class CreateStoreClosureDto {
  @IsString() @MinLength(1) date!: string; // YYYY-MM-DD
  @IsOptional() @IsString() reason?: string | null;
}

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

  @Get("stores/detail")
  storesDetail(@CurrentUser() user: AuthUser) {
    return this.merchant.listStores({ id: user.id, roles: user.roles });
  }

  @Post("stores")
  createStore(@CurrentUser() user: AuthUser, @Body() dto: CreateStoreDto) {
    return this.merchant.createStore({ id: user.id, roles: user.roles }, dto);
  }

  @Patch("stores/:id")
  updateStore(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.merchant.updateStore({ id: user.id, roles: user.roles }, id, dto);
  }

  // ── Horário de funcionamento + fechamentos (story 52) ──

  @Get("stores/:id/hours")
  storeHours(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.merchant.storeHours({ id: user.id, roles: user.roles }, id);
  }

  @Put("stores/:id/hours")
  setStoreHours(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: SetStoreHoursDto,
  ) {
    return this.merchant.setStoreHours({ id: user.id, roles: user.roles }, id, dto.hours);
  }

  @Get("stores/:id/closures")
  storeClosures(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.merchant.storeClosures({ id: user.id, roles: user.roles }, id);
  }

  @Post("stores/:id/closures")
  addStoreClosure(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CreateStoreClosureDto,
  ) {
    return this.merchant.addStoreClosure({ id: user.id, roles: user.roles }, id, dto);
  }

  @Delete("stores/:id/closures/:closureId")
  removeStoreClosure(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("closureId") closureId: string,
  ) {
    return this.merchant.removeStoreClosure({ id: user.id, roles: user.roles }, id, closureId);
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
