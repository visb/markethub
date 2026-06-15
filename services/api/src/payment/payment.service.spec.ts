import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PaymentService } from "./payment.service";

/**
 * Foco C07: cobrança PIX e webhook do gateway. createPixForOrder (guarda de
 * estado, reuso de cobrança pendente válida, criação nova) e handleWebhook
 * (idempotência do paid, fallback de gorjeta, estados expired/failed).
 * refund.pricing já coberto em refund.pricing.spec.ts.
 */

const FUTURE = new Date(Date.now() + 3600_000);
const PAST = new Date(Date.now() - 3600_000);

function makeService(opts: {
  order?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  tip?: Record<string, unknown> | null;
  parseWebhook?: unknown;
  providerName?: string;
}) {
  const paymentUpdate = jest.fn().mockResolvedValue({});
  const paymentUpsert = jest.fn().mockResolvedValue({
    status: "pending",
    amountCents: 5000,
    pixQrCode: "qr",
    pixQrCodeUrl: "url",
    expiresAt: FUTURE,
    paidAt: null,
  });
  const tipUpdate = jest.fn().mockResolvedValue({});
  const markPaid = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
    payment: {
      findFirst: jest.fn().mockResolvedValue(opts.payment ?? null),
      upsert: paymentUpsert,
      update: paymentUpdate,
    },
    tip: {
      findFirst: jest.fn().mockResolvedValue(opts.tip ?? null),
      update: tipUpdate,
    },
  } as never;

  const createPixCharge = jest.fn().mockResolvedValue({
    chargeId: "ch1",
    qrCode: "qr",
    qrCodeUrl: "url",
    expiresAt: FUTURE,
    raw: {},
  });
  const provider = {
    name: opts.providerName ?? "mock",
    createPixCharge,
    parseWebhook: jest.fn().mockReturnValue("parseWebhook" in opts ? opts.parseWebhook : null),
  } as never;
  const orders = { markPaid } as never;
  const config = { get: jest.fn().mockReturnValue(900) } as never;

  const svc = new PaymentService(prisma, provider, orders, config);
  return { svc, createPixCharge, paymentUpdate, paymentUpsert, tipUpdate, markPaid };
}

describe("PaymentService.createPixForOrder", () => {
  it("ORDER_NOT_FOUND quando o pedido não é do usuário", async () => {
    const { svc } = makeService({ order: { userId: "outro", status: "created" } });
    await expect(svc.createPixForOrder("u1", "o1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ORDER_NOT_PAYABLE quando o pedido não está aberto", async () => {
    const { svc } = makeService({ order: { userId: "u1", status: "paid" } });
    await expect(svc.createPixForOrder("u1", "o1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reaproveita cobrança pendente válida sem chamar o provider", async () => {
    const { svc, createPixCharge } = makeService({
      order: {
        userId: "u1",
        status: "created",
        totalCents: 5000,
        user: { name: "N", email: "e" },
        payment: {
          status: "pending",
          expiresAt: FUTURE,
          amountCents: 5000,
          pixQrCode: "qr",
          pixQrCodeUrl: "url",
          paidAt: null,
        },
      },
    });
    await svc.createPixForOrder("u1", "o1");
    expect(createPixCharge).not.toHaveBeenCalled();
  });

  it("cria nova cobrança quando a anterior expirou", async () => {
    const { svc, createPixCharge, paymentUpsert } = makeService({
      order: {
        id: "o1",
        userId: "u1",
        status: "created",
        totalCents: 5000,
        user: { name: "N", email: "e" },
        payment: { status: "pending", expiresAt: PAST },
      },
    });
    const view = await svc.createPixForOrder("u1", "o1");
    expect(createPixCharge).toHaveBeenCalled();
    expect(paymentUpsert).toHaveBeenCalled();
    expect(view.qrCode).toBe("qr");
  });
});

describe("PaymentService.handleWebhook", () => {
  it("parseWebhook null → handled false", async () => {
    const { svc } = makeService({ parseWebhook: null });
    expect(await svc.handleWebhook({})).toEqual({ handled: false });
  });

  it("paid: marca pago e dispara markPaid do pedido", async () => {
    const { svc, paymentUpdate, markPaid } = makeService({
      parseWebhook: { chargeId: "ch1", status: "paid" },
      payment: { id: "p1", orderId: "o1", status: "pending" },
    });
    const r = await svc.handleWebhook({}, "sig");
    expect(r).toEqual({ handled: true });
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "paid" }) }),
    );
    expect(markPaid).toHaveBeenCalledWith("o1");
  });

  it("idempotente: pagamento já pago não redispara markPaid", async () => {
    const { svc, paymentUpdate, markPaid } = makeService({
      parseWebhook: { chargeId: "ch1", status: "paid" },
      payment: { id: "p1", orderId: "o1", status: "paid" },
    });
    await svc.handleWebhook({});
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("status expired → marca payment expired sem markPaid", async () => {
    const { svc, paymentUpdate, markPaid } = makeService({
      parseWebhook: { chargeId: "ch1", status: "expired" },
      payment: { id: "p1", orderId: "o1", status: "pending" },
    });
    await svc.handleWebhook({});
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "expired" } }),
    );
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("cobrança não encontrada → fallback de gorjeta (Tip) por chargeId", async () => {
    const { svc, tipUpdate } = makeService({
      parseWebhook: { chargeId: "ch1", status: "paid" },
      payment: null,
      tip: { id: "tip1", status: "pending" },
    });
    const r = await svc.handleWebhook({});
    expect(r).toEqual({ handled: true });
    expect(tipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "paid" }) }),
    );
  });

  it("nem payment nem tip → handled false", async () => {
    const { svc } = makeService({
      parseWebhook: { chargeId: "ch1", status: "paid" },
      payment: null,
      tip: null,
    });
    expect(await svc.handleWebhook({})).toEqual({ handled: false });
  });
});
