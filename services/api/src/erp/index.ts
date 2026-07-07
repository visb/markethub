/**
 * API pública do módulo erp / contexto catalog (story 47) — consumida pelo
 * support (handlers de evento empurram pedido pago ao ERP; integration usa o
 * registry de connectors). DI do módulo via erp.module direto.
 */
export * from "./connector-registry";
export * from "./erp.service";
