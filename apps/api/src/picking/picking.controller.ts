import { BadRequestException, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PickingService } from "./picking.service";

@Roles("picker")
@Controller("pick-tasks")
export class PickingController {
  constructor(private readonly picking: PickingService) {}

  /** Lojas em que o usuário atua como separador. */
  @Get("stores")
  stores(@CurrentUser() user: AuthUser) {
    return this.picking.myStores(user.id);
  }

  /** Fila de tarefas de uma loja (queued + atribuídas ao separador). */
  @Get()
  queue(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    if (!storeId) {
      throw new BadRequestException({ code: "STORE_ID_REQUIRED", message: "storeId é obrigatório" });
    }
    return this.picking.listQueue(user.id, storeId);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.picking.getTask(user.id, id);
  }

  @Post(":id/assign")
  assign(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.picking.assign(user.id, id);
  }

  @Post(":id/release")
  release(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.picking.release(user.id, id);
  }
}
