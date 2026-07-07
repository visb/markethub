import { PixChargeService } from "./pix-charge.service";

/**
 * Story 46: criação/reuso da cobrança PIX compartilhada entre o endpoint /pay e
 * o handler `gerar-cobranca-pix` do `order.created`. Idempotência por
 * construção: cobrança pendente válida → short-circuit sem chamar o gateway;
 * pedido fora de `created` (pago/cancelado/inexistente) → no-op (null).
 * Provider é mock atrás da interface PaymentProvider (nunca gateway real).
 */

const FUTURE = new Date(Date.now() + 3600_000);
const PAST = new Date(Date.now() - 3600_000);

const OPEN_ORDER = {
  id: "o1",
  status: "created",
  totalCents: 5000,
  user: { name: "N", email: "e@x.com" },
  payment: null as Record<string, unknown> | null,
};

function makeService(order: Record<string, unknown> | null) {
  const upsert = jest.fn().mockResolvedValue({ id: "p1", status: "pending" });
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    payment: { upsert },
  } as never;
  const createPixCharge = jest.fn().mockResolvedValue({
    chargeId: "ch1",
    qrCode: "qr",
    qrCodeUrl: "url",
    expiresAt: FUTURE,
    raw: { provider: "mock" },
  });
  const provider = { name: "mock", createPixCharge } as never;
  const config = { get: jest.fn().mockReturnValue(900) } as never;
  const svc = new PixChargeService(prisma, provider, config);
  return { svc, upsert, createPixCharge };
}

describe("PixChargeService.ensureForOrder", () => {
  it("pedido inexistente → null (no-op p/ o handler)", async () => {
    const { svc, createPixCharge } = makeService(null);
    expect(await svc.ensureForOrder("o1")).toBeNull();
    expect(createPixCharge).not.toHaveBeenCalled();
  });

  it("pedido fora de created (pago/cancelado) → null sem chamar o gateway", async () => {
    const { svc, createPixCharge, upsert } = makeService({ ...OPEN_ORDER, status: "preparing" });
    expect(await svc.ensureForOrder("o1")).toBeNull();
    expect(createPixCharge).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("cobrança pendente válida → reaproveita (idempotente, sem gateway)", async () => {
    const payment = { id: "p1", status: "pending", expiresAt: FUTURE };
    const { svc, createPixCharge, upsert } = makeService({ ...OPEN_ORDER, payment });
    expect(await svc.ensureForOrder("o1")).toBe(payment);
    expect(createPixCharge).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("sem cobrança → cria no gateway e faz upsert do Payment", async () => {
    const { svc, createPixCharge, upsert } = makeService({ ...OPEN_ORDER });
    const payment = await svc.ensureForOrder("o1");
    expect(createPixCharge).toHaveBeenCalledWith({
      orderId: "o1",
      amountCents: 5000,
      customer: { name: "N", email: "e@x.com" },
      expiresInSeconds: 900,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "o1" },
        create: expect.objectContaining({
          orderId: "o1",
          provider: "mock",
          providerChargeId: "ch1",
          status: "pending",
          amountCents: 5000,
        }),
      }),
    );
    expect(payment).toMatchObject({ id: "p1" });
  });

  it("cobrança expirada → gera nova e reseta paidAt no update", async () => {
    const { svc, createPixCharge, upsert } = makeService({
      ...OPEN_ORDER,
      payment: { id: "p1", status: "pending", expiresAt: PAST },
    });
    await svc.ensureForOrder("o1");
    expect(createPixCharge).toHaveBeenCalled();
    const arg = upsert.mock.calls[0]![0] as { update: { paidAt: null; providerChargeId: string } };
    expect(arg.update.providerChargeId).toBe("ch1");
    expect(arg.update.paidAt).toBeNull();
  });

  it("falha do gateway propaga (retry isolado do handler)", async () => {
    const { svc, createPixCharge, upsert } = makeService({ ...OPEN_ORDER });
    createPixCharge.mockRejectedValue(new Error("gateway fora"));
    await expect(svc.ensureForOrder("o1")).rejects.toThrow("gateway fora");
    expect(upsert).not.toHaveBeenCalled();
  });
});
