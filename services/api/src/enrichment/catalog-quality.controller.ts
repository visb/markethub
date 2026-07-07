import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { Roles } from "../auth";
import { CatalogQualityService } from "./catalog-quality.service";

class RequeueDto {
  @IsOptional() @IsString() productId?: string;
}

/** Painel de qualidade de catálogo (S5.5) — admin. */
@Roles("admin")
@Controller("catalog-quality")
export class CatalogQualityController {
  constructor(private readonly quality: CatalogQualityService) {}

  @Get("summary")
  summary(@Query("storeId") storeId?: string, @Query("categoryId") categoryId?: string) {
    return this.quality.summary({ storeId, categoryId });
  }

  @Get("incomplete")
  incomplete(
    @Query("storeId") storeId?: string,
    @Query("categoryId") categoryId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.quality.incomplete({ storeId, categoryId, limit: limit ? Number(limit) : undefined });
  }

  @Post("requeue")
  requeue(@Body() dto: RequeueDto) {
    return this.quality.requeue(dto.productId);
  }

  @Get("snapshots")
  snapshots(@Query("limit") limit?: string) {
    return this.quality.snapshots(limit ? Number(limit) : undefined);
  }

  @Post("snapshots")
  capture() {
    return this.quality.captureSnapshot();
  }
}
