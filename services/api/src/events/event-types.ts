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

/** Mapa tipo → payload. */
export interface DomainEventMap {
  "order.created": OrderCreatedPayload;
  "order.paid": OrderPaidPayload;
  "picking.done": PickingDonePayload;
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
