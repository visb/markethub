import type { DomainEventType } from "./event-types";

/**
 * Registro de subscribers (story 45): fonte única que o relay consulta para o
 * fan-out. Cada handler tem NOME estável (dedupe key no ProcessedEvent e jobId
 * determinístico) e FILA BullMQ própria (retry/backoff isolados por side-effect).
 * O nome do handler É o nome da fila — 1:1 por construção.
 */

export const ORDER_CREATED_GERAR_COBRANCA_PIX = "order-created.gerar-cobranca-pix";
export const ORDER_CREATED_NOTIFICAR = "order-created.notificar";
export const ORDER_PAID_PUSH_ERP = "order-paid.push-erp";
export const ORDER_PAID_GERAR_PICKING = "order-paid.gerar-picking";
export const ORDER_PAID_NOTIFICAR = "order-paid.notificar";
export const PICKING_DONE_INICIAR_ENTREGA = "picking-done.iniciar-entrega";
export const PICKING_DONE_NOTIFICAR = "picking-done.notificar";
export const PICKING_DONE_VERIFICAR_SHORTFALL_REFUND = "picking-done.verificar-shortfall-refund";
export const ORDER_CANCELED_LIBERAR_SLOT = "order-canceled.liberar-slot";
export const ORDER_CANCELED_EMITIR_ESTORNO = "order-canceled.emitir-estorno";
export const ORDER_CANCELED_NOTIFICAR = "order-canceled.notificar";
export const ORDER_GROUP_CANCELED_EMITIR_ESTORNO = "order-group-canceled.emitir-estorno";
export const ORDER_GROUP_CANCELED_NOTIFICAR = "order-group-canceled.notificar";

/** eventType → handlers inscritos. */
export const SUBSCRIPTIONS: Record<DomainEventType, readonly string[]> = {
  "order.created": [ORDER_CREATED_GERAR_COBRANCA_PIX, ORDER_CREATED_NOTIFICAR],
  "order.paid": [ORDER_PAID_PUSH_ERP, ORDER_PAID_GERAR_PICKING, ORDER_PAID_NOTIFICAR],
  "picking.done": [
    PICKING_DONE_INICIAR_ENTREGA,
    PICKING_DONE_NOTIFICAR,
    PICKING_DONE_VERIFICAR_SHORTFALL_REFUND,
  ],
  "order.canceled": [
    ORDER_CANCELED_LIBERAR_SLOT,
    ORDER_CANCELED_EMITIR_ESTORNO,
    ORDER_CANCELED_NOTIFICAR,
  ],
  "order.group_canceled": [
    ORDER_GROUP_CANCELED_EMITIR_ESTORNO,
    ORDER_GROUP_CANCELED_NOTIFICAR,
  ],
};

/** Todas as filas de handler (p/ registerQueue + injeção do mapa no relay). */
export const HANDLER_QUEUE_NAMES: readonly string[] = [
  ...new Set(Object.values(SUBSCRIPTIONS).flat()),
];

/** Token do mapa handler → Queue BullMQ consumido pelo relay. */
export const HANDLER_QUEUES = Symbol("HANDLER_QUEUES");

/**
 * jobId determinístico do fan-out — dedupe de enfileiramento no BullMQ.
 * Separador `__` (não `:`): o BullMQ REJEITA jobId customizado contendo `:`
 * ("Custom Id cannot contain :") — com `:` todo tick do relay falhava no
 * enqueue e nenhum evento era entregue (bug latente da story 45, invisível nos
 * units porque a Queue é mock; pego no e2e da story 46).
 */
export function handlerJobId(eventId: string, handler: string): string {
  return `${eventId}__${handler}`;
}
