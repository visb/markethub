/**
 * Contratos dos eventos de domínio (story 45). O payload carrega o MÍNIMO para o
 * handler resolver o resto por id (relê o estado atual do banco) — payload gordo
 * fica obsoleto entre a emissão e o processamento.
 */

/** Pedido criado no checkout (status created), com seus grupos, na mesma TX. */
export interface OrderCreatedPayload {
  orderId: string;
}

/** Pagamento confirmado; pedido transicionou para preparing. */
export interface OrderPaidPayload {
  orderId: string;
}

/** Separação do grupo concluída/pronta (OrderGroup → ready_for_pickup). */
export interface PickingDonePayload {
  orderGroupId: string;
}

/**
 * Pedido cancelado pelo cliente (story 48). Além do orderId, carrega o
 * deliverySlotId reservado (se houver) — o handler `liberar-slot` não precisa
 * reler o pedido para saber qual vaga devolver.
 */
export interface OrderCanceledPayload {
  orderId: string;
  deliverySlotId: string | null;
}

/**
 * Sub-pedido (OrderGroup) cancelado pela loja/marketplace (story 54). O payload
 * carrega o valor já rateado do estorno (total do grupo − cupom proporcional,
 * calculado na TX de cancelGroup, quando os totais/desconto do pedido estão à
 * mão) — o handler acumula esse valor no Refund 1:1 do pedido e dispara o estorno
 * PARCIAL no gateway. `reason` é o resumo legível gravado no Refund.
 */
export interface OrderGroupCanceledPayload {
  orderId: string;
  groupId: string;
  amountCents: number;
  reason: string;
}

/**
 * Entrega reportada como falha pelo entregador (story 61) — cliente ausente,
 * endereço errado, recusa etc. Payload mínimo para os handlers (push ao cliente +
 * realtime ao merchant) resolverem o resto por id. `reason` é o motivo cru
 * (DeliveryFailReason) para compor a mensagem legível.
 */
export interface DeliveryFailedPayload {
  orderId: string;
  groupId: string;
  deliveryId: string;
  reason: "customer_absent" | "wrong_address" | "refused" | "other";
}

/** Mapa tipo → payload. */
export interface DomainEventMap {
  "order.created": OrderCreatedPayload;
  "order.paid": OrderPaidPayload;
  "picking.done": PickingDonePayload;
  "order.canceled": OrderCanceledPayload;
  "order.group_canceled": OrderGroupCanceledPayload;
  "delivery.failed": DeliveryFailedPayload;
}

export type DomainEventType = keyof DomainEventMap;

/** Entrada do OutboxPublisher.publish — evento tipado + agregado de origem. */
export interface DomainEventInput<T extends DomainEventType = DomainEventType> {
  type: T;
  payload: DomainEventMap[T];
  /** Id do agregado de origem (ex.: orderId) — indexado p/ consulta/debug. */
  aggregateId: string;
}

/** Payload do job entregue a cada handler no fan-out do relay. */
export interface HandlerJobData {
  eventId: string;
  type: DomainEventType;
  payload: unknown;
}
