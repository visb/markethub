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
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { MerchantStaffService } from "./merchant-staff.service";

const STAFF_ROLES = ["admin", "manager", "picker", "driver"] as const;
type StaffRoleDto = (typeof STAFF_ROLES)[number];

class CreateStaffDto {
  @IsString() @MinLength(1) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsIn(STAFF_ROLES) staffRole!: StaffRoleDto;
  @IsString() @MinLength(1) storeId!: string;
}

class UpdateStaffDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(STAFF_ROLES) staffRole?: StaffRoleDto;
}

/**
 * Colaboradores (StoreStaff — story 10). Sem `@Roles` de classe (como o
 * merchant-context controller): owner (RoleName `merchant`) e manager (RoleName
 * `customer` + StoreStaff manager) precisam alcançar estas rotas. Toda a
 * autorização de escopo de loja e regra de papel é reforçada no
 * `MerchantStaffService` — a tela nunca é a fonte da verdade (CLAUDE.md).
 */
@Controller("merchant/staff")
export class MerchantStaffController {
  constructor(private readonly staff: MerchantStaffService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    return this.staff.list({ id: user.id, roles: user.roles }, storeId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staff.create({ id: user.id, roles: user.roles }, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update({ id: user.id, roles: user.roles }, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("hard") hard?: string,
  ) {
    return this.staff.remove({ id: user.id, roles: user.roles }, id, hard === "true");
  }
}
