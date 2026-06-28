import { BadRequestException, NotFoundException } from "@nestjs/common";
import { TipsService } from "./tips.service";

/**
 * Backfill de cobertura (story 22). Gorjeta ao entregador mexe em valor pago:
 * validação do valor, ownership + pedido entregue, resolução do driverId pela
 * Delivery do grupo, cobrança PIX via provider e idempotência (uma gorjeta por
 * pedido, não recria se já paga). Sem DB — Prisma/provider/config mockados.
 */

const TIP_MAX = 50_00;
const PIX_EXPIRES = 900;

function makeService(opts: {
  order?: Record<string, unknown> | null;
  tip?: Record<string, unknown> | null;
  providerName?: string;
} = {}) {
  const upsert = jest.fn().mockImplementation(({ create }) => ({
    id: "tip1",
    pixQrCode: "qr",
    pixQrCodeUrl: "url",
    expiresAt: new Date("2026-06-28T12:00:00Z"),
    paidAt: null,
    ...create,
  }));
  const tipUpdate = jest.fn().mockResolvedValue({});
  const prisma = {
    tip: {
      findUnique: jest.fn().mockResolvedValue("tip" in opts ? opts.tip : null),
      upsert,
      update: tipUpdate,
    },
    order: {
      findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null),
    },
  } as never;

  const createPixCharge = jest.fn().mockResolvedValue({
    chargeId: "ch1",
    qrCode: "qr-code",
    qrCodeUrl: "qr-url",
    expiresAt: new Date("2026-06-28T12:00:00Z"),
    raw: {},
  });
  const provider = { name: opts.providerName ?? "mock", createPixCharge } as never;

  const config = {
    get: jest.fn((key: string) => {
      if (key === "TIP_MAX_CENTS") return TIP_MAX;
      if (key === "PIX_EXPIRES_SECONDS") return PIX_EXPIRES;
      return undefined;
    }),
  } as never;

  const svc = new TipsService(prisma, provider, config);
  return { svc, prisma, upsert, createPixCharge, tipUpdate };
}

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    userId: "u1",
    status: "delivered",
    user: { name: "Cliente", email: "c@x.com" },
    groups: [{ fulfillment: "delivery", delivery: { driverId: "d1" } }],
    tip: null,
    ...over,
  };
}

describe("TipsService.create — validação de valor", () => {
  it.each([
    ["não-inteiro", 10.5],
    ["zero", 0],
    ["negativo", -100],
    ["acima do máximo", TIP_MAX + 1],
  ])("INVALID_TIP_AMOUNT quando %s", async (_label, amount) => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", amount)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_TIP_AMOUNT" }),
    });
  });
});

describe("TipsService.create", () => {
  it("ORDER_NOT_FOUND quando o pedido não existe", async () => {
    const { svc } = makeService({ order: null });
    await expect(svc.create("u1", "o1", 500)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ORDER_NOT_FOUND quando não é o dono", async () => {
    const { svc } = makeService({ order: order({ userId: "outro" }) });
    await expect(svc.create("u1", "o1", 500)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ORDER_NOT_FOUND" }),
    });
  });

  it("ORDER_NOT_DELIVERED quando o pedido ainda não foi entregue", async () => {
    const { svc } = makeService({ order: order({ status: "picking" }) });
    await expect(svc.create("u1", "o1", 500)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ORDER_NOT_DELIVERED" }),
    });
  });

  it("TIP_ALREADY_PAID quando já existe gorjeta paga (idempotência)", async () => {
    const { svc, createPixCharge } = makeService({
      order: order({ tip: { status: "paid" } }),
    });
    await expect(svc.create("u1", "o1", 500)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TIP_ALREADY_PAID" }),
    });
    expect(createPixCharge).not.toHaveBeenCalled();
  });

  it("NO_DRIVER quando nenhum grupo de entrega tem entregador", async () => {
    const { svc } = makeService({
      order: order({ groups: [{ fulfillment: "pickup", delivery: null }] }),
    });
    await expect(svc.create("u1", "o1", 500)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NO_DRIVER" }),
    });
  });

  it("sucesso: cria cobrança PIX, associa driver e faz upsert pending", async () => {
    const { svc, createPixCharge, upsert } = makeService({ order: order() });
    const view = await svc.create("u1", "o1", 500);
    expect(createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "o1",
        amountCents: 500,
        customer: { name: "Cliente", email: "c@x.com" },
        expiresInSeconds: PIX_EXPIRES,
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "o1" },
        create: expect.objectContaining({
          driverId: "d1",
          amountCents: 500,
          status: "pending",
          providerChargeId: "ch1",
        }),
      }),
    );
    expect(view).toMatchObject({ id: "tip1", amountCents: 500, status: "pending", qrCode: "qr-code" });
  });

  it("recria (re-upsert) gorjeta pendente existente sem erro de idempotência", async () => {
    const { svc, upsert } = makeService({ order: order({ tip: { status: "pending" } }) });
    await svc.create("u1", "o1", 700);
    expect(upsert).toHaveBeenCalled();
  });
});

describe("TipsService.get", () => {
  it("TIP_NOT_FOUND quando não há gorjeta do dono", async () => {
    const { svc } = makeService({ tip: null });
    await expect(svc.get("u1", "o1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TIP_NOT_FOUND" }),
    });
  });

  it("TIP_NOT_FOUND quando a gorjeta é de outro usuário", async () => {
    const { svc } = makeService({
      tip: { id: "tip1", order: { userId: "outro" }, amountCents: 500 },
    });
    await expect(svc.get("u1", "o1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("retorna a view da gorjeta do dono", async () => {
    const { svc } = makeService({
      tip: {
        id: "tip1",
        orderId: "o1",
        driverId: "d1",
        amountCents: 500,
        status: "paid",
        pixQrCode: "qr",
        pixQrCodeUrl: "url",
        expiresAt: new Date("2026-06-28T12:00:00Z"),
        paidAt: new Date("2026-06-28T11:00:00Z"),
        order: { userId: "u1" },
      },
    });
    const view = await svc.get("u1", "o1");
    expect(view).toMatchObject({
      id: "tip1",
      driverId: "d1",
      amountCents: 500,
      status: "paid",
      qrCode: "qr",
      qrCodeUrl: "url",
    });
    expect(view.paidAt).toBe("2026-06-28T11:00:00.000Z");
  });
});

describe("TipsService.mockPay", () => {
  it("NOT_MOCK quando o provider não é mock", async () => {
    const { svc } = makeService({ providerName: "pagarme" });
    await expect(svc.mockPay("u1", "o1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NOT_MOCK" }),
    });
  });

  it("TIP_NOT_FOUND quando não há gorjeta do dono", async () => {
    const { svc } = makeService({ tip: null });
    await expect(svc.mockPay("u1", "o1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marca a gorjeta como paga", async () => {
    const { svc, tipUpdate } = makeService({
      tip: { id: "tip1", order: { userId: "u1" } },
    });
    const out = await svc.mockPay("u1", "o1");
    expect(tipUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "o1" },
        data: expect.objectContaining({ status: "paid" }),
      }),
    );
    expect(out).toEqual({ handled: true });
  });
});
