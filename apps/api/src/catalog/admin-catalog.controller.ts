import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { EnrichmentStatus } from "@prisma/client";
import { IsArray, IsOptional, IsString } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { EnrichmentService } from "../enrichment/enrichment.service";
import { AdminCatalogService } from "./admin-catalog.service";

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() brand?: string | null;
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsString() imageUrl?: string | null;
  @IsOptional() @IsString() categoryId?: string | null;
}

class UnlockDto {
  @IsArray()
  @IsString({ each: true })
  fields!: string[];
}

@Roles("admin")
@Controller("admin/products")
export class AdminCatalogController {
  constructor(
    private readonly admin: AdminCatalogService,
    private readonly enrichment: EnrichmentService,
  ) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("status") status?: EnrichmentStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.admin.listProducts({
      search,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.admin.productDetail(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.admin.updateProduct(id, dto);
  }

  @Post(":id/unlock")
  unlock(@Param("id") id: string, @Body() dto: UnlockDto) {
    return this.admin.unlockFields(id, dto.fields);
  }

  @Post(":id/enrich")
  enrich(@Param("id") id: string) {
    return this.enrichment.enrichProduct(id);
  }
}
