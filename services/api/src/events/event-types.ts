/**
 * Contratos dos eventos de domínio (story 45). O payload carrega o MÍNIMO para o
 * handler resolver o resto por id (relê o estado atual do banco) — payload gordo
 * fica obsoleto entre a emissão e o processamento.
 */

/** Pagamento confirmado; pedido transicionou para preparing. */
export interface OrderPaidPayload {
  orderId: string;
}

/** Mapa tipo → payload. Story 46 adiciona order.created / picking.done aqui. */
export interface DomainEventMap {
  "order.paid": OrderPaidPayload;
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
