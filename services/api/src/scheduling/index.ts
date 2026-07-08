/**
 * API pública do módulo scheduling / contexto fulfillment (story 48) — fachada
 * consumida pelo handler `liberar-slot` do `order.canceled` (support): liberação
 * da vaga do slot ao cancelar. DI do módulo via scheduling.module direto.
 */
export * from "./scheduling.service";
