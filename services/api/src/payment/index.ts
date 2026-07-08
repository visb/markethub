/**
 * API pública do contexto payment (story 47) — cobrança PIX e estorno (handlers
 * de evento, stories 46/48) e o contrato PaymentProvider (gorjetas/engagement).
 * payment.service NÃO é público: o acoplamento herdado com fulfillment está na
 * allow-list do eslint.config.mjs, vedado para código novo.
 * DI dos módulos via *.module direto.
 */
export * from "./payment-provider.interface";
export * from "./pix-charge.service";
export * from "./refund.service";
