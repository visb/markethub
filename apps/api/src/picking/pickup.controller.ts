import { BadRequestException, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { HandoffService } from "./handoff.service";

/**
 * Fila de coleta — contrato estável para a Fase 4 (entregador) consumir.
 * Lista tarefas prontas por loja e confirma a coleta (OrderGroup → on_the_way).
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
  confirm(@Param("taskId") taskId: string) {
    return this.handoff.confirmPickup(taskId);
  }
}
