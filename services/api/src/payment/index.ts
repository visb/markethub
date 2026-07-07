/**
 * API pública do contexto payment (story 47) — cobrança PIX (handlers de
 * evento) e o contrato PaymentProvider (gorjetas/engagement). refund.* e
 * payment.service NÃO são públicos: o acoplamento herdado com fulfillment está
 * na allow-list do eslint.config.mjs, vedado para código novo.
 * DI dos módulos via *.module direto.
 */
export * from "./payment-provider.interface";
export * from "./pix-charge.service";
