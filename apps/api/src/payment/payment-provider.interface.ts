/** Abstração de gateway de pagamento PIX. Implementações: Pagar.me e Mock. */

export interface CreatePixChargeInput {
  orderId: string;
  amountCents: number;
  customer: { name: string; email: string };
  expiresInSeconds: number;
}

export interface PixCharge {
  chargeId: string;
  qrCode: string; // copia-e-cola
  qrCodeUrl: string | null; // imagem do QR
  expiresAt: Date;
  raw: unknown;
}

export type WebhookStatus = "paid" | "failed" | "expired";

export interface WebhookEvent {
  chargeId: string;
  status: WebhookStatus;
  raw: unknown;
}

export interface RefundInput {
  /** Id da cobrança no gateway (Payment.providerChargeId). */
  chargeId: string;
  /** Valor a estornar em centavos (estorno parcial permitido). */
  amountCents: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>;
  /** Interpreta o webhook do gateway; retorna null se não for evento de pagamento relevante. */
  parseWebhook(payload: unknown, signature?: string): WebhookEvent | null;
  /** Estorna (parcial ou total) uma cobrança PIX. */
  refund(input: RefundInput): Promise<RefundResult>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
