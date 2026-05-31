import { randomUUID } from "node:crypto";
import type {
  CreatePixChargeInput,
  PaymentProvider,
  PixCharge,
  WebhookEvent,
} from "../payment-provider.interface";

/**
 * Provider de pagamento fake (dev/test). Gera QR fictício. A confirmação é simulada
 * via endpoint admin/dev (POST /payments/:id/mock-pay) ou webhook manual.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const chargeId = `mock_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    return Promise.resolve({
      chargeId,
      qrCode: `00020126MOCK-PIX-${input.orderId}-${input.amountCents}`,
      qrCodeUrl: null,
      expiresAt,
      raw: { mock: true, ...input },
    });
  }

  parseWebhook(payload: unknown): WebhookEvent | null {
    const p = payload as { chargeId?: string; status?: string };
    if (!p?.chargeId || !p?.status) return null;
    if (!["paid", "failed", "expired"].includes(p.status)) return null;
    return { chargeId: p.chargeId, status: p.status as WebhookEvent["status"], raw: payload };
  }
}
