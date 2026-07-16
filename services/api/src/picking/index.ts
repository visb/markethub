/**
 * API pública do módulo picking / contexto fulfillment (story 47) — fachadas
 * consumidas pelos handlers de evento (support): geração de tarefas, tracking
 * e emissão de eventos socket. Internals (handoff, sessão, gateway, mappers)
 * ficam fora; DI do módulo via picking.module direto.
 */
export * from "./order.events";
export * from "./picker-metrics.service";
export * from "./order-tracking.service";
export * from "./picking.events";
export * from "./picking.service";
