import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { StoreDeliveryService } from "./store-delivery.service";

class AssignDto {
  @IsString() @MinLength(1) driverId!: string;
}

class HandoverDto {
  @IsString() @MinLength(1) code!: string;
}

/** Despacho de entregas pela loja (manager/picker): fila, atribuição e retirada. */
@Roles("merchant", "picker", "admin")
@Controller("store")
export class StoreDeliveriesController {
  constructor(private readonly store: StoreDeliveryService) {}

  /** Fila de entregas da loja. */
  @Get("deliveries")
  deliveries(
    @CurrentUser() user: AuthUser,
    @Query("storeId") storeId?: string,
    @Query("status") status?: string,
  ) {
    if (!storeId) {
      throw new BadRequestException({ code: "STORE_ID_REQUIRED", message: "storeId é obrigatório" });
    }
    return this.store.queue(user.id, storeId, status);
  }

  /** Entregadores vinculados à loja (para atribuição). */
  @Get("drivers")
  drivers(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    if (!storeId) {
      throw new BadRequestException({ code: "STORE_ID_REQUIRED", message: "storeId é obrigatório" });
    }
    return this.store.drivers(user.id, storeId);
  }

  /** Atribui um entregador à entrega. */
  @Post("deliveries/:id/assign")
  assign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: AssignDto) {
    return this.store.assign(user.id, id, dto.driverId);
  }

  /** Desfaz a atribuição. */
  @Post("deliveries/:id/unassign")
  unassign(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.store.unassign(user.id, id);
  }

  /** Reenvia uma entrega com falha (story 61): failed → unassigned. */
  @Post("deliveries/:id/retry")
  retry(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.store.retry(user.id, id);
  }

  /** Retirada na loja: cliente apresenta o código e a loja confirma a entrega. */
  @Post("order-groups/:id/handover")
  handover(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: HandoverDto) {
    return this.store.handover(user.id, id, dto.code);
  }
}
