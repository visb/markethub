import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { PickingSessionService } from "./picking-session.service";
import { PickingService } from "./picking.service";

class UpdatePickItemDto {
  @IsIn(["pick", "refuse"]) action!: "pick" | "refuse";
  @IsOptional() @IsInt() @Min(1) quantityPicked?: number;
  @IsOptional() @IsInt() @Min(1) weightGramsPicked?: number;
  @IsOptional() @IsString() @MinLength(1) refusalReason?: string;
}

@Roles("picker")
@Controller("pick-tasks")
export class PickingController {
  constructor(
    private readonly picking: PickingService,
    private readonly session: PickingSessionService,
  ) {}

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

  // ── Sessão de separação item a item (S3.3) ──

  @Post(":id/start")
  start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.session.start(user.id, id);
  }

  @Patch(":id/items/:itemId")
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdatePickItemDto,
  ) {
    return this.session.updateItem(user.id, id, itemId, dto);
  }

  @Post(":id/complete-picking")
  completePicking(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.session.completePicking(user.id, id);
  }
}
