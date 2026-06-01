import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { MarketplaceCategoryService } from "./marketplace-category.service";

class CreateMktCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsString() parentId?: string | null;
}

class UpdateMktCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() displayOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsString() parentId?: string | null;
}

class AssignRawDto {
  @IsOptional() @IsString() marketplaceCategoryId?: string | null;
}

// Público: marketplace (app cliente) lê as categorias curadas visíveis.
@Public()
@Controller("marketplace-categories")
export class MarketplaceCategoryPublicController {
  constructor(private readonly svc: MarketplaceCategoryService) {}

  @Get()
  list() {
    return this.svc.listPublic();
  }
}

// Admin: curadoria das categorias do marketplace.
@Roles("admin")
@Controller("admin/marketplace-categories")
export class AdminMarketplaceCategoryController {
  constructor(private readonly svc: MarketplaceCategoryService) {}

  @Get()
  list() {
    return this.svc.listAdmin();
  }

  @Get("raw")
  rawCategories() {
    return this.svc.listRawCategories();
  }

  @Post()
  create(@Body() dto: CreateMktCategoryDto) {
    return this.svc.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMktCategoryDto) {
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }

  @Post("raw/:categoryId/assign")
  assignRaw(@Param("categoryId") categoryId: string, @Body() dto: AssignRawDto) {
    return this.svc.assignRaw(categoryId, dto.marketplaceCategoryId ?? null);
  }
}
