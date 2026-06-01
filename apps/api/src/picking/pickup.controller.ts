import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { HandoffService } from "./handoff.service";

class ConfirmPickupDto {
  @IsString() @MinLength(1) pickupCode!: string;
}

/**
 * Fila de coleta — contrato estável para a Fase 4 (entregador) consumir.
 * Lista tarefas prontas por loja e confirma a coleta validando o pickupCode
 * (OrderGroup → on_the_way).
 */
@Roles("driver", "admin")
@Controller("pickups")
export class PickupController {
  constructor(private readonly handoff: HandoffService) {}

  @Get()
  queue(@Query("storeId") storeId?: string) {
    if (!storeId) {
      throw new BadRequestException({ code: "STORE_ID_REQUIRED", message: "storeId é obrigatório" });
    }
    return this.handoff.listReadyForPickup(storeId);
  }

  @Post(":taskId/confirm")
  confirm(@Param("taskId") taskId: string, @Body() dto: ConfirmPickupDto) {
    return this.handoff.confirmPickup(taskId, dto.pickupCode);
  }
}
