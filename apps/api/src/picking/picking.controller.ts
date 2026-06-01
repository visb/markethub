import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { HandoffService } from "./handoff.service";
import { PackingService } from "./packing.service";
import { PickingSessionService } from "./picking-session.service";
import { PickingService } from "./picking.service";
import { SubstitutionService } from "./substitution.service";

class UpdatePickItemDto {
  @IsIn(["pick", "refuse"]) action!: "pick" | "refuse";
  @IsOptional() @IsInt() @Min(1) quantityPicked?: number;
  @IsOptional() @IsInt() @Min(1) weightGramsPicked?: number;
  @IsOptional() @IsString() @MinLength(1) refusalReason?: string;
}

class ProposeSubstitutionDto {
  @IsString() @MinLength(1) substituteOfferId!: string;
}

@Roles("picker")
@Controller("pick-tasks")
export class PickingController {
  constructor(
    private readonly picking: PickingService,
    private readonly session: PickingSessionService,
    private readonly substitution: SubstitutionService,
    private readonly packing: PackingService,
    private readonly handoff: HandoffService,
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

  /** Propõe um substituto (Offer da mesma loja) para um item sem estoque (S3.4). */
  @Post(":id/items/:itemId/substitute")
  substitute(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: ProposeSubstitutionDto,
  ) {
    return this.substitution.propose(user.id, id, itemId, dto.substituteOfferId);
  }

  // ── Empacotamento em caixas (S3.5) ──

  @Post(":id/boxes")
  createBox(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.packing.createBox(user.id, id);
  }

  @Post(":id/boxes/:boxId/items/:itemId")
  allocate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("boxId") boxId: string,
    @Param("itemId") itemId: string,
  ) {
    return this.packing.allocate(user.id, id, boxId, itemId);
  }

  @Delete(":id/items/:itemId/box")
  unallocate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ) {
    return this.packing.unallocate(user.id, id, itemId);
  }

  @Get(":id/boxes/:boxId/label")
  label(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("boxId") boxId: string) {
    return this.packing.label(user.id, id, boxId);
  }

  @Post(":id/pack")
  pack(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.packing.pack(user.id, id);
  }

  /** Handoff: marca a tarefa empacotada como pronta para coleta (S3.6). */
  @Post(":id/ready")
  ready(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.handoff.markReady(user.id, id);
  }
}
