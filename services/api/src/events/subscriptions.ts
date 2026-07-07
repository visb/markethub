import type { DomainEventType } from "./event-types";

/**
 * Registro de subscribers (story 45): fonte única que o relay consulta para o
 * fan-out. Cada handler tem NOME estável (dedupe key no ProcessedEvent e jobId
 * determinístico) e FILA BullMQ própria (retry/backoff isolados por side-effect).
 * O nome do handler É o nome da fila — 1:1 por construção.
 */

export const ORDER_PAID_PUSH_ERP = "order-paid.push-erp";
export const ORDER_PAID_GERAR_PICKING = "order-paid.gerar-picking";
export const ORDER_PAID_NOTIFICAR = "order-paid.notificar";

/** eventType → handlers inscritos. Story 46 adiciona novos tipos/handlers aqui. */
export const SUBSCRIPTIONS: Record<DomainEventType, readonly string[]> = {
  "order.paid": [ORDER_PAID_PUSH_ERP, ORDER_PAID_GERAR_PICKING, ORDER_PAID_NOTIFICAR],
};

/** Todas as filas de handler (p/ registerQueue + injeção do mapa no relay). */
export const HANDLER_QUEUE_NAMES: readonly string[] = [
  ...new Set(Object.values(SUBSCRIPTIONS).flat()),
];

/** Token do mapa handler → Queue BullMQ consumido pelo relay. */
export const HANDLER_QUEUES = Symbol("HANDLER_QUEUES");

/** jobId determinístico do fan-out — dedupe de enfileiramento no BullMQ. */
export function handlerJobId(eventId: string, handler: string): string {
  return `${eventId}:${handler}`;
}
