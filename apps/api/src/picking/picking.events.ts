import { Injectable, Logger } from "@nestjs/common";
import type { PickTaskStatus } from "@prisma/client";

/**
 * Publica eventos de mudança de status de PickTask. Stub baseado em log nesta
 * fase; o transporte realtime (WebSocket/SSE) é implementado em S3.8 trocando
 * esta implementação por uma que faça broadcast.
 */
@Injectable()
export class PickingEvents {
  private readonly logger = new Logger(PickingEvents.name);

  taskStatusChanged(task: {
    id: string;
    storeId: string;
    orderGroupId: string;
    pickerId: string | null;
    status: PickTaskStatus;
  }): void {
    this.logger.log(
      `pick-task ${task.id} → ${task.status} (store=${task.storeId} picker=${task.pickerId ?? "-"})`,
    );
  }
}
