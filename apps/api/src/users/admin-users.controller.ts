import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { RoleName, StaffRole } from "@prisma/client";
import { IsBoolean, IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { AdminUsersService } from "./admin-users.service";

class SetActiveDto {
  @IsBoolean()
  active!: boolean;
}

class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(["manager", "picker", "driver"])
  staffRole!: StaffRole;

  @IsString()
  storeId!: string;
}

@Roles("admin")
@Controller("admin/stores")
export class AdminStoresController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list() {
    return this.users.listStores();
  }
}

@Roles("admin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(
    @Query("role") role?: RoleName,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.users.list({
      role,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.users.detail(id);
  }

  @Post(":id/active")
  setActive(@Param("id") id: string, @Body() dto: SetActiveDto) {
    return this.users.setActive(id, dto.active);
  }

  @Post()
  createStaff(@Body() dto: CreateStaffDto) {
    return this.users.createStaff(dto);
  }
}
