import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth";
import type { AuthUser } from "../auth";
import { MerchantVehiclesService } from "./merchant-vehicles.service";

const VEHICLE_TYPES = ["motorcycle", "car", "van"] as const;
type VehicleTypeDto = (typeof VEHICLE_TYPES)[number];

class CreateVehicleDto {
  @IsString() @MinLength(1) plate!: string;
  @IsIn(VEHICLE_TYPES) type!: VehicleTypeDto;
  @IsOptional() @IsString() @MaxLength(200) description?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() merchantId?: string;
}

class UpdateVehicleDto {
  @IsOptional() @IsString() @MinLength(1) plate?: string;
  @IsOptional() @IsIn(VEHICLE_TYPES) type?: VehicleTypeDto;
  @IsOptional() @IsString() @MaxLength(200) description?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

/**
 * Frota de veículos de entrega (story 14). Sem `@Roles` de classe (como os demais
 * controllers do merchant): owner (RoleName `merchant`) e manager (RoleName
 * `customer` + StoreStaff manager) precisam alcançar estas rotas. Todo o escopo de
 * rede é reforçado no `MerchantVehiclesService` — a tela nunca é a fonte da verdade.
 */
@Controller("merchant/vehicles")
export class MerchantVehiclesController {
  constructor(private readonly vehicles: MerchantVehiclesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("merchantId") merchantId?: string) {
    return this.vehicles.list({ id: user.id, roles: user.roles }, merchantId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create({ id: user.id, roles: user.roles }, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update({ id: user.id, roles: user.roles }, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("hard") hard?: string) {
    return this.vehicles.remove({ id: user.id, roles: user.roles }, id, hard === "true");
  }
}
