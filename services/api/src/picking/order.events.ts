import { Injectable } from "@nestjs/common";
import { PickingGateway } from "./picking.gateway";

// Contrato espelhado de @markethub/types (picking-events). O api não depende do
// pacote de tipos; mantenha em sincronia. Mesmos nomes consumidos pela story 09
// (webhooks) — aqui o transporte é socket à store room (story 12).
const ORDER_CREATED_EVENT = "order.created";
const ORDER_STATUS_CHANGED_EVENT = "order.status_changed";

export interface OrderStoreEvent {
  orderId: string;
  merchantId: string;
  storeId: string;
  status: string;
}

/**
 * Publica eventos de pedido (OrderGroup) na store room do gateway Socket.IO para
 * o app merchant acompanhar pedidos em tempo real (story 12). Best-effort — o
 * estado é recuperado via REST na (re)conexão. `created` ao surgir o grupo na
 * loja; `statusChanged` a cada transição de status do OrderGroup.
 */
@Injectable()
export class OrderEvents {
  constructor(private readonly gateway: PickingGateway) {}

  created(event: OrderStoreEvent): void {
    this.gateway.emitToStore(event.storeId, ORDER_CREATED_EVENT, {
      orderId: event.orderId,
      merchantId: event.merchantId,
      storeId: event.storeId,
      status: event.status,
    });
  }

  statusChanged(event: OrderStoreEvent): void {
    this.gateway.emitToStore(event.storeId, ORDER_STATUS_CHANGED_EVENT, {
      orderId: event.orderId,
      merchantId: event.merchantId,
      storeId: event.storeId,
      status: event.status,
    });
  }
}
