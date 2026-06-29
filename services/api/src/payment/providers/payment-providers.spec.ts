import { MockPaymentProvider } from "./mock.payment-provider";
import { PagarmePaymentProvider } from "./pagarme.payment-provider";
import type { CreatePixChargeInput, RefundInput } from "../payment-provider.interface";

/**
 * Story 20: cobertura dos provedores de pagamento (mock + Pagar.me).
 * Provider atrás de interface — Pagar.me testado com `fetch` mockado, sem rede real.
 */

const pixInput: CreatePixChargeInput = {
  orderId: "ord1",
  amountCents: 5000,
  customer: { name: "Cliente", email: "c@example.com" },
  expiresInSeconds: 900,
};

const refundInput: RefundInput = {
  chargeId: "ch_123",
  amountCents: 2000,
  reason: "weight_shortfall",
};

describe("MockPaymentProvider", () => {
  const provider = new MockPaymentProvider();

  it("expõe name 'mock'", () => {
    expect(provider.name).toBe("mock");
  });

  it("createPixCharge gera QR fictício com chargeId mock_*", async () => {
    const charge = await provider.createPixCharge(pixInput);
    expect(charge.chargeId).toMatch(/^mock_/);
    expect(charge.qrCode).toContain("MOCK-PIX-ord1-5000");
    expect(charge.qrCodeUrl).toBeNull();
    expect(charge.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(charge.raw).toMatchObject({ mock: true, orderId: "ord1" });
  });

  it("refund sempre sucede com refundId mock_refund_*", async () => {
    const result = await provider.refund(refundInput);
    expect(result.refundId).toMatch(/^mock_refund_/);
    expect(result.raw).toMatchObject({ mock: true, chargeId: "ch_123" });
  });

  it("parseWebhook reconhece status válidos (paid/failed/expired)", () => {
    for (const status of ["paid", "failed", "expired"] as const) {
      expect(provider.parseWebhook({ chargeId: "ch1", status })).toEqual({
        chargeId: "ch1",
        status,
        raw: { chargeId: "ch1", status },
      });
    }
  });

  it("parseWebhook retorna null sem chargeId ou status", () => {
    expect(provider.parseWebhook({ status: "paid" })).toBeNull();
    expect(provider.parseWebhook({ chargeId: "ch1" })).toBeNull();
    expect(provider.parseWebhook(null)).toBeNull();
  });

  it("parseWebhook retorna null para status desconhecido", () => {
    expect(provider.parseWebhook({ chargeId: "ch1", status: "refunded" })).toBeNull();
  });
});

describe("PagarmePaymentProvider", () => {
  const baseUrl = "https://api.pagar.me/core/v5";
  const secretKey = "sk_test_abc";
  let provider: PagarmePaymentProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new PagarmePaymentProvider(baseUrl, secretKey);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function okResponse(json: unknown): Response {
    return {
      ok: true,
      status: 200,
      json: () => Promise.resolve(json),
      text: () => Promise.resolve(""),
    } as unknown as Response;
  }

  function errResponse(status: number, text: string): Response {
    return {
      ok: false,
      status,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(text),
    } as unknown as Response;
  }

  it("expõe name 'pagarme'", () => {
    expect(provider.name).toBe("pagarme");
  });

  it("createPixCharge: POST /orders com Basic auth e mapeia QR code", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        charges: [
          {
            id: "ch_real",
            last_transaction: {
              qr_code: "qrpix",
              qr_code_url: "https://qr.png",
              expires_at: "2026-06-28T12:00:00.000Z",
            },
          },
        ],
      }),
    );

    const charge = await provider.createPixCharge(pixInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/orders`);
    expect(init.method).toBe("POST");
    const expectedAuth = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
    expect(init.headers.Authorization).toBe(expectedAuth);
    const body = JSON.parse(init.body);
    expect(body.payments[0].payment_method).toBe("pix");
    expect(body.payments[0].pix.expires_in).toBe(900);
    expect(body.items[0].amount).toBe(5000);

    expect(charge.chargeId).toBe("ch_real");
    expect(charge.qrCode).toBe("qrpix");
    expect(charge.qrCodeUrl).toBe("https://qr.png");
    expect(charge.expiresAt).toEqual(new Date("2026-06-28T12:00:00.000Z"));
  });

  it("createPixCharge: usa fallback de expiresAt quando o gateway não envia expires_at", async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        charges: [
          { id: "ch_real", last_transaction: { qr_code: "qrpix" } },
        ],
      }),
    );
    const before = Date.now();
    const charge = await provider.createPixCharge(pixInput);
    expect(charge.qrCodeUrl).toBeNull();
    expect(charge.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 900 * 1000 - 50);
  });

  it("createPixCharge: lança erro quando o HTTP falha (status != ok)", async () => {
    fetchMock.mockResolvedValue(errResponse(401, "unauthorized"));
    await expect(provider.createPixCharge(pixInput)).rejects.toThrow(/Pagar\.me error 401/);
  });

  it("createPixCharge: lança erro quando a resposta não traz QR code", async () => {
    fetchMock.mockResolvedValue(okResponse({ charges: [{ id: "ch_real" }] }));
    await expect(provider.createPixCharge(pixInput)).rejects.toThrow(/sem QR code/);
  });

  it("refund: DELETE /charges/{id} com amount e retorna refundId do last_transaction", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ id: "ch_123", last_transaction: { id: "tx_refund" } }),
    );
    const result = await provider.refund(refundInput);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/charges/ch_123`);
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ amount: 2000 });
    expect(result.refundId).toBe("tx_refund");
  });

  it("refund: cai para data.id quando não há last_transaction.id", async () => {
    fetchMock.mockResolvedValue(okResponse({ id: "refund_top" }));
    const result = await provider.refund(refundInput);
    expect(result.refundId).toBe("refund_top");
  });

  it("refund: cai para o chargeId quando a resposta não traz id algum", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const result = await provider.refund(refundInput);
    expect(result.refundId).toBe("ch_123");
  });

  it("refund: lança erro quando o gateway falha", async () => {
    fetchMock.mockResolvedValue(errResponse(422, "cannot refund"));
    await expect(provider.refund(refundInput)).rejects.toThrow(/Pagar\.me refund error 422/);
  });

  it("parseWebhook: mapeia charge.paid/payment_failed/expired", () => {
    const cases: Array<[string, string]> = [
      ["charge.paid", "paid"],
      ["charge.payment_failed", "failed"],
      ["charge.expired", "expired"],
    ];
    for (const [type, status] of cases) {
      expect(provider.parseWebhook({ type, data: { id: "ch_x", status: "ignored" } })).toEqual({
        chargeId: "ch_x",
        status,
        raw: { type, data: { id: "ch_x", status: "ignored" } },
      });
    }
  });

  it("parseWebhook: retorna null sem type, sem data.id ou para evento irrelevante", () => {
    expect(provider.parseWebhook({ data: { id: "ch_x" } })).toBeNull();
    expect(provider.parseWebhook({ type: "charge.paid" })).toBeNull();
    expect(provider.parseWebhook({ type: "charge.created", data: { id: "ch_x" } })).toBeNull();
    expect(provider.parseWebhook(null)).toBeNull();
  });
});
