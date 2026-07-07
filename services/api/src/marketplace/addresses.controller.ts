import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { CurrentUser, Public, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { AddressesService } from "./addresses.service";
import { COVERED_CITIES } from "./coverage";

class AddressDto {
  @IsString() @MinLength(1) label!: string;
  @IsString() @MinLength(1) street!: string;
  @IsString() @MinLength(1) number!: string;
  @IsOptional() @IsString() district?: string | null;
  @IsString() @MinLength(1) city!: string;
  @IsString() @MinLength(2) state!: string;
  @IsString() @MinLength(8) zipCode!: string;
  @IsOptional() @IsString() complement?: string | null;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

class UpdateAddressDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() district?: string | null;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() zipCode?: string;
  @IsOptional() @IsString() complement?: string | null;
  @IsOptional() @IsNumber() latitude?: number | null;
  @IsOptional() @IsNumber() longitude?: number | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

/** Área de cobertura (S6.3): o app valida a cidade antes do submit. */
@Public()
@Controller("coverage")
export class CoverageController {
  @Get("cities")
  cities() {
    return COVERED_CITIES;
  }
}

@Roles("customer")
@Controller("addresses")
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateAddressDto) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.addresses.remove(user.id, id);
  }

  @Post(":id/default")
  setDefault(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.addresses.setDefault(user.id, id);
  }
}
