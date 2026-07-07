import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PaymentService } from "./payment.service";

/**
 * Foco C07: cobrança PIX e webhook do gateway. createPixForOrder (guarda de
 * posse/estado + delegação ao PixChargeService — story 46) e handleWebhook
 * (idempotência do paid, fallback de gorjeta, estados expired/failed).
 * Criação/reuso da cobrança coberta em pix-charge.service.spec.ts;
 * refund.pricing em refund.pricing.spec.ts.
 */

const FUTURE = new Date(Date.now() + 3600_000);

function makeService(opts: {
  order?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  tip?: Record<string, unknown> | null;
  parseWebhook?: unknown;
  providerName?: string;
  ensured?: Record<string, unknown> | null;
}) {
  const paymentUpdate = jest.fn().mockResolvedValue({});
  const tipUpdate = jest.fn().mockResolvedValue({});
  const markPaid = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
    payment: {
      findFirst: jest.fn().mockResolvedValue(opts.payment ?? null),
      update: paymentUpdate,
    },
    tip: {
      findFirst: jest.fn().mockResolvedValue(opts.tip ?? null),
      update: tipUpdate,
    },
  } as never;

  const provider = {
    name: opts.providerName ?? "mock",
    parseWebhook: jest.fn().mockReturnValue("parseWebhook" in opts ? opts.parseWebhook : null),
  } as never;
  const orders = { markPaid } as never;
  const ensureForOrder = jest.fn().mockResolvedValue(
    "ensured" in opts
      ? opts.ensured
      : {
          status: "pending",
          amountCents: 5000,
          pixQrCode: "qr",
          pixQrCodeUrl: "url",
          expiresAt: FUTURE,
          paidAt: null,
        },
  );
  const pixCharge = { ensureForOrder } as never;

  const svc = new PaymentService(prisma, provider, orders, pixCharge);
  return { svc, ensureForOrder, paymentUpdate, tipUpdate, markPaid };
}

describe("PaymentService.createPixForOrder", () => {
  it("ORDER_NOT_FOUND quando o pedido não é do usuário", async () => {
    const { svc, ensureForOrder } = makeService({ order: { userId: "outro", status: "created" } });
    await expect(svc.createPixForOrder("u1", "o1")).rejects.toBeInstanceOf(NotFoundException);
    expect(ensureForOrder).not.toHaveBeenCalled();
  });

  it("ORDER_NOT_PAYABLE quando o pedido não está aberto", async () => {
    const { svc, ensureForOrder } = makeService({ order: { userId: "u1", status: "paid" } });
    await expect(svc.createPixForOrder("u1", "o1")).rejects.toBeInstanceOf(BadRequestException);
    expect(ensureForOrder).not.toHaveBeenCalled();
  });

  it("delega a criação/reuso da cobrança ao PixChargeService e devolve a view", async () => {
    const { svc, ensureForOrder } = makeService({ order: { userId: "u1", status: "created" } });
    const view = await svc.createPixForOrder("u1", "o1");
    expect(ensureForOrder).toHaveBeenCalledWith("o1");
    expect(view.qrCode).toBe("qr");
    expect(view.amountCents).toBe(5000);
  });

  it("corrida: pedido deixou de estar aberto durante a cobrança → ORDER_NOT_PAYABLE", async () => {
    const { svc } = makeService({ order: { userId: "u1", status: "created" }, ensured: null });
    await expect(svc.createPixForOrder("u1", "o1")).rejects.toMatchObject({
      response: { code: "ORDER_NOT_PAYABLE" },
    });
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
