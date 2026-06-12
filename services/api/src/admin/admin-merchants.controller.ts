import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { StorageService } from "../storage/storage.service";
import { AdminMerchantsService } from "./admin-merchants.service";

class CreateMerchantDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsInt() @Min(0) deliveryFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) prepFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) platformFeeBps?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateMerchantDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() slug?: string;
  /** URL pública da logo (após upload via logo-upload-url); null remove. */
  @IsOptional() logoUrl?: string | null;
  @IsOptional() @IsInt() @Min(0) deliveryFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) prepFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) platformFeeBps?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class LogoUploadUrlDto {
  @IsString() @MinLength(1) filename!: string;
  @IsString() @MinLength(1) contentType!: string;
}

class CreateStoreDto {
  @IsString() @MinLength(1) merchantId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class UpdateStoreDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() externalId?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  /** Tempo médio de preparo (min) — compõe o ETA real (S6.7). */
  @IsOptional() @IsInt() @Min(1) avgPrepMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
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

class SetActiveDto {
  @IsBoolean() active!: boolean;
}

/** Navegação + CRUD admin de mercados. Somente admin. */
@Roles("admin")
@Controller("admin/merchants")
export class AdminMerchantsController {
  constructor(
    private readonly merchants: AdminMerchantsService,
    private readonly storage: StorageService,
  ) {}

  /** Presigna upload da logo do mercado (PUT direto no S3/MinIO). */
  @Post(":id/logo-upload-url")
  logoUploadUrl(@Param("id") id: string, @Body() dto: LogoUploadUrlDto) {
    const safe = dto.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return this.storage.presignUpload(`merchants/${id}/logo-${Date.now()}-${safe}`, dto.contentType);
  }

  @Get()
  list(@Query("search") search?: string) {
    return this.merchants.listMerchants(search);
  }

  @Post()
  create(@Body() dto: CreateMerchantDto) {
    return this.merchants.createMerchant(dto);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.merchants.merchantDetail(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMerchantDto) {
    return this.merchants.updateMerchant(id, dto);
  }
}

/**
 * Detalhe + CRUD da loja e filhos (ofertas/estoque, staff) para o admin. Convive
 * com o `GET /admin/stores` index (users.module): rotas exatas distintas, sem colisão.
 */
@Roles("admin")
@Controller("admin/stores")
export class AdminStoreDetailController {
  constructor(private readonly merchants: AdminMerchantsService) {}

  @Post()
  create(@Body() dto: CreateStoreDto) {
    return this.merchants.createStore(dto);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.merchants.storeDetail(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStoreDto) {
    return this.merchants.updateStore(id, dto);
  }

  @Patch(":id/active")
  setActive(@Param("id") id: string, @Body() dto: SetActiveDto) {
    return this.merchants.setStoreActive(id, dto.active);
  }

  @Get(":id/offers")
  offers(
    @Param("id") id: string,
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
    @Query("available") available?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.merchants.storeOffers(id, {
      search,
      categoryId,
      available: available === undefined ? undefined : available === "true",
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id/staff")
  staff(@Param("id") id: string) {
    return this.merchants.storeStaff(id);
  }

  // ── Ofertas / estoque ──

  @Patch("offers/:offerId")
  updateOffer(
    @CurrentUser() user: AuthUser,
    @Param("offerId") offerId: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.merchants.updateOffer(offerId, dto, user.id);
  }

  @Delete("offers/:offerId/locks/:field")
  unlockOffer(
    @CurrentUser() user: AuthUser,
    @Param("offerId") offerId: string,
    @Param("field") field: string,
  ) {
    return this.merchants.unlockOffer(offerId, field, user.id);
  }

  @Patch("stocks/:stockId")
  updateStock(
    @CurrentUser() user: AuthUser,
    @Param("stockId") stockId: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.merchants.updateStock(stockId, dto, user.id);
  }

  @Delete("stocks/:stockId/locks/:field")
  unlockStock(
    @CurrentUser() user: AuthUser,
    @Param("stockId") stockId: string,
    @Param("field") field: string,
  ) {
    return this.merchants.unlockStock(stockId, field, user.id);
  }

  // ── Funcionários ──

  @Patch("staff/:staffId/active")
  setStaffActive(@Param("staffId") staffId: string, @Body() dto: SetActiveDto) {
    return this.merchants.setStaffActive(staffId, dto.active);
  }

  @Delete("staff/:staffId")
  removeStaff(@Param("staffId") staffId: string) {
    return this.merchants.removeStaff(staffId);
  }
}
