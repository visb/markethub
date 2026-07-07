import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { IsInt, IsString, Min, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { SchedulingService } from "./scheduling.service";

class CreateSlotDto {
  @IsString() @MinLength(1) storeId!: string;
  @IsString() start!: string;
  @IsString() end!: string;
  @IsInt() @Min(1) capacity!: number;
}

/** Slots de capacidade por loja (S5.3): cliente lista disponíveis; manager gere. */
@Controller()
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  /** Slots disponíveis da loja (checkout do cliente). */
  @Roles("customer")
  @Get("stores/:storeId/slots")
  available(@Param("storeId") storeId: string, @Query("date") date?: string) {
    const from = date ? new Date(date) : undefined;
    const to = date ? new Date(new Date(date).getTime() + 86400_000) : undefined;
    return this.scheduling.listAvailable(storeId, { from, to });
  }

  /** Gestão de slots da loja (manager/admin). */
  @Roles("merchant", "admin")
  @Get("store/slots")
  forStore(@CurrentUser() user: AuthUser, @Query("storeId") storeId: string) {
    return this.scheduling.listForStore(user.id, user.roles, storeId);
  }

  @Roles("merchant", "admin")
  @Post("store/slots")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSlotDto) {
    return this.scheduling.create(user.id, user.roles, dto);
  }

  @Roles("merchant", "admin")
  @Delete("store/slots/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.scheduling.deleteSlot(user.id, user.roles, id);
  }
}
