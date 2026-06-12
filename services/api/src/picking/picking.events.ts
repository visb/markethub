import { Injectable, Logger } from "@nestjs/common";
import type { PickTaskStatus } from "@prisma/client";
import { PickingGateway } from "./picking.gateway";

/**
 * Publica eventos de separação no gateway Socket.IO (S3.8) e dispara push em
 * eventos-chave. Canais: store:<storeId> (separadores/manager/admin) e
 * group:<orderGroupId> (cliente dono / staff).
 */
@Injectable()
export class PickingEvents {
  private readonly logger = new Logger(PickingEvents.name);

  constructor(private readonly gateway: PickingGateway) {}

  taskStatusChanged(task: {
    id: string;
    storeId: string;
    orderGroupId: string;
    pickerId: string | null;
    status: PickTaskStatus;
  }): void {
    const payload = {
      pickTaskId: task.id,
      orderGroupId: task.orderGroupId,
      storeId: task.storeId,
      status: task.status,
      pickerId: task.pickerId,
    };
    this.gateway.emitToStore(task.storeId, "pick_task.updated", payload);
    this.gateway.emitToGroup(task.orderGroupId, "pick_task.updated", payload);
    if (task.status === "assigned") {
      this.gateway.emitToStore(task.storeId, "pick_task.assigned", payload);
    }
  }

  itemUpdated(item: { orderGroupId: string; pickItemId: string; status: string }): void {
    this.gateway.emitToGroup(item.orderGroupId, "item.updated", {
      orderGroupId: item.orderGroupId,
      pickItemId: item.pickItemId,
      status: item.status,
    });
  }

  substitutionProposed(sub: {
    id: string;
    pickItemId: string;
    orderGroupId: string;
  }): void {
    this.gateway.emitToGroup(sub.orderGroupId, "substitution.proposed", {
      substitutionId: sub.id,
      orderGroupId: sub.orderGroupId,
      pickItemId: sub.pickItemId,
      approvalStatus: "pending",
    });
    this.push(`Substituição pendente: aprove ou recuse um item (grupo ${sub.orderGroupId})`);
  }

  substitutionResolved(sub: {
    id: string;
    pickItemId: string;
    orderGroupId: string;
    approvalStatus: "approved" | "rejected";
  }): void {
    this.gateway.emitToGroup(sub.orderGroupId, "substitution.resolved", {
      substitutionId: sub.id,
      orderGroupId: sub.orderGroupId,
      pickItemId: sub.pickItemId,
      approvalStatus: sub.approvalStatus,
    });
  }

  readyForPickup(payload: {
    pickTaskId: string;
    storeId: string;
    orderGroupId: string;
  }): void {
    const body = {
      pickTaskId: payload.pickTaskId,
      orderGroupId: payload.orderGroupId,
      storeId: payload.storeId,
      status: "ready_for_pickup",
    };
    this.gateway.emitToStore(payload.storeId, "pick_task.ready_for_pickup", body);
    this.gateway.emitToGroup(payload.orderGroupId, "pick_task.ready_for_pickup", body);
    this.push("Pedido pronto para coleta");
  }

  /** Stub de push: integração real (FCM/APNs) fica para fase posterior. */
  private push(message: string): void {
    this.logger.log(`[push] ${message}`);
  }
}
