/**
 * API pública do módulo events / contexto support (story 47) — o contrato de
 * eventos de domínio (payloads/tipos) e o publisher transacional do outbox
 * (stories 45/46). Relay, handlers e idempotência são internos; DI via
 * events.module / outbox.module direto.
 */
export * from "./event-types";
export * from "./outbox.publisher";
