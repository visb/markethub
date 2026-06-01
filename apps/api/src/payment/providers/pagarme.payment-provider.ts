import { Logger } from "@nestjs/common";
import type {
  CreatePixChargeInput,
  PaymentProvider,
  PixCharge,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from "../payment-provider.interface";

interface PagarmeCharge {
  id?: string;
  last_transaction?: {
    qr_code?: string;
    qr_code_url?: string;
    expires_at?: string;
  };
}
interface PagarmeOrderResponse {
  charges?: PagarmeCharge[];
}

/**
 * Provider real Pagar.me (API v5). PIX via POST /orders. Auth Basic com a secret key.
 * Docs: https://docs.pagar.me/
 */
export class PagarmePaymentProvider implements PaymentProvider {
  readonly name = "pagarme";
  private readonly logger = new Logger(PagarmePaymentProvider.name);

  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
  ) {}

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const body = {
      items: [
        {
          amount: input.amountCents,
          description: `Pedido ${input.orderId}`,
          quantity: 1,
          code: input.orderId,
        },
      ],
      customer: { name: input.customer.name, email: input.customer.email, type: "individual" },
      payments: [
        {
          payment_method: "pix",
          pix: { expires_in: input.expiresInSeconds },
        },
      ],
      code: input.orderId,
    };

    const res = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Pagar.me error ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as PagarmeOrderResponse;
    const charge = data.charges?.[0];
    const tx = charge?.last_transaction;
    if (!charge?.id || !tx?.qr_code) {
      throw new Error("Pagar.me: resposta sem QR code");
    }

    return {
      chargeId: charge.id,
      qrCode: tx.qr_code,
      qrCodeUrl: tx.qr_code_url ?? null,
      expiresAt: tx.expires_at ? new Date(tx.expires_at) : new Date(Date.now() + input.expiresInSeconds * 1000),
      raw: data,
    };
  }

  /**
   * Estorno PIX (parcial ou total): DELETE /charges/{id} com `amount` em centavos.
   * Docs: https://docs.pagar.me/reference/estornar-uma-cobran%C3%A7a
   */
  async refund(input: RefundInput): Promise<RefundResult> {
    const res = await fetch(`${this.baseUrl}/charges/${input.chargeId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: input.amountCents }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Pagar.me refund error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as { id?: string; last_transaction?: { id?: string } };
    const refundId = data.last_transaction?.id ?? data.id ?? input.chargeId;
    return { refundId, raw: data };
  }

  parseWebhook(payload: unknown): WebhookEvent | null {
    const ev = payload as { type?: string; data?: { id?: string; status?: string } };
    if (!ev?.type || !ev.data?.id) return null;
    const map: Record<string, WebhookEvent["status"]> = {
      "charge.paid": "paid",
      "charge.payment_failed": "failed",
      "charge.expired": "expired",
    };
    const status = map[ev.type];
    if (!status) return null;
    return { chargeId: ev.data.id, status, raw: payload };
  }

  private basicAuth(): string {
    return Buffer.from(`${this.secretKey}:`).toString("base64");
  }
}
