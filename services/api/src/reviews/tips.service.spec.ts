import { NotFoundException } from "@nestjs/common";
import { TipsService, type TipItemInput } from "./tips.service";

/**
 * Gorjeta individual por alvo (story 77). Uma cobrança PIX por pedido soma os
 * itens (plataforma, entregador e/ou cada mercado). Cobre validação dos alvos
 * (driver só com entrega; merchant do pedido; sem duplicado), soma do total,
 * UMA cobrança via provider e a leitura dos alvos. Sem DB — tudo mockado.
 */

const TIP_MAX = 50_00;
const PIX_EXPIRES = 900;

function makeService(
  opts: {
    order?: Record<string, unknown> | null;
    tip?: Record<string, unknown> | null;
    providerName?: string;
  } = {},
) {
  const upsert = jest.fn().mockImplementation(({ create }) => ({
    id: "tip1",
    orderId: create?.orderId ?? "o1",
    driverId: create?.driverId ?? null,
    amountCents: create?.amountCents ?? 0,
    status: "pending",
    pixQrCode: "qr-code",
    pixQrCodeUrl: "qr-url",
    expiresAt: new Date("2026-06-28T12:00:00Z"),
    paidAt: null,
    items: (create?.items?.create ?? []).map((i: Record<string, unknown>) => ({
      target: i.target,
      targetDriverId: i.targetDriverId ?? null,
      targetMerchantId: i.targetMerchantId ?? null,
      amountCents: i.amountCents,
    })),
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
    groups: [
      {
        fulfillment: "delivery",
        store: { merchantId: "m1", merchant: { name: "Mercado 1" } },
        delivery: { driverId: "d1", driver: { name: "Entregador" } },
      },
    ],
    tip: null,
    ...over,
  };
}

const platform = (cents: number): TipItemInput => ({ target: "platform", amountCents: cents });
const driver = (cents: number): TipItemInput => ({ target: "driver", amountCents: cents });
const merchant = (id: string, cents: number): TipItemInput => ({
  target: "merchant",
  targetId: id,
  amountCents: cents,
});

describe("TipsService.create — validação de entrada", () => {
  it("INVALID_TIP_ITEMS quando não há itens", async () => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", [])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_TIP_ITEMS" }),
    });
  });

  it.each([
    ["não-inteiro", 10.5],
    ["zero", 0],
    ["negativo", -100],
  ])("INVALID_TIP_AMOUNT quando o valor é %s", async (_label, amount) => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", [platform(amount)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_TIP_AMOUNT" }),
    });
  });

  it("INVALID_TIP_AMOUNT quando o total ultrapassa o máximo", async () => {
    const { svc } = makeService({ order: order() });
    await expect(
      svc.create("u1", "o1", [platform(TIP_MAX), driver(200)]),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "INVALID_TIP_AMOUNT" }) });
  });
});

describe("TipsService.create — posse/estado", () => {
  it("ORDER_NOT_FOUND quando o pedido não existe", async () => {
    const { svc } = makeService({ order: null });
    await expect(svc.create("u1", "o1", [platform(200)])).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ORDER_NOT_FOUND quando não é o dono", async () => {
    const { svc } = makeService({ order: order({ userId: "outro" }) });
    await expect(svc.create("u1", "o1", [platform(200)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ORDER_NOT_FOUND" }),
    });
  });

  it("ORDER_NOT_DELIVERED quando o pedido ainda não foi entregue", async () => {
    const { svc } = makeService({ order: order({ status: "picking" }) });
    await expect(svc.create("u1", "o1", [platform(200)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ORDER_NOT_DELIVERED" }),
    });
  });

  it("TIP_ALREADY_PAID quando já existe gorjeta paga", async () => {
    const { svc, createPixCharge } = makeService({ order: order({ tip: { status: "paid" } }) });
    await expect(svc.create("u1", "o1", [platform(200)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TIP_ALREADY_PAID" }),
    });
    expect(createPixCharge).not.toHaveBeenCalled();
  });
});

describe("TipsService.create — validação de alvos", () => {
  it("TIP_DRIVER_NOT_IN_ORDER quando o pedido é retirada (sem entregador)", async () => {
    const { svc, createPixCharge } = makeService({
      order: order({
        groups: [
          {
            fulfillment: "pickup",
            store: { merchantId: "m1", merchant: { name: "Mercado 1" } },
            delivery: null,
          },
        ],
      }),
    });
    await expect(svc.create("u1", "o1", [driver(200)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TIP_DRIVER_NOT_IN_ORDER" }),
    });
    expect(createPixCharge).not.toHaveBeenCalled();
  });

  it("TIP_MERCHANT_NOT_IN_ORDER quando o mercado não pertence ao pedido", async () => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", [merchant("m9", 200)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "TIP_MERCHANT_NOT_IN_ORDER" }),
    });
  });

  it("TIP_MERCHANT_NOT_IN_ORDER quando o item merchant vem sem targetId", async () => {
    const { svc } = makeService({ order: order() });
    await expect(
      svc.create("u1", "o1", [{ target: "merchant", amountCents: 200 }]),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "TIP_MERCHANT_NOT_IN_ORDER" }) });
  });

  it("DUPLICATE_TIP_TARGET quando a plataforma aparece duas vezes", async () => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", [platform(200), platform(300)])).rejects.toMatchObject({
      response: expect.objectContaining({ code: "DUPLICATE_TIP_TARGET" }),
    });
  });

  it("DUPLICATE_TIP_TARGET quando o mesmo mercado aparece duas vezes", async () => {
    const { svc } = makeService({ order: order() });
    await expect(
      svc.create("u1", "o1", [merchant("m1", 200), merchant("m1", 300)]),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "DUPLICATE_TIP_TARGET" }) });
  });

  it("INVALID_TIP_TARGET quando o alvo não é reconhecido", async () => {
    const { svc } = makeService({ order: order() });
    await expect(
      svc.create("u1", "o1", [{ target: "bogus" as never, amountCents: 200 }]),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "INVALID_TIP_TARGET" }) });
  });
});

describe("TipsService.create — sucesso multi-alvo", () => {
  it("soma o total e gera UMA cobrança PIX com os itens", async () => {
    const { svc, createPixCharge, upsert } = makeService({ order: order() });
    const view = await svc.create("u1", "o1", [platform(200), driver(300), merchant("m1", 500)]);

    // uma única cobrança do total (1000)
    expect(createPixCharge).toHaveBeenCalledTimes(1);
    expect(createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "o1",
        amountCents: 1000,
        customer: { name: "Cliente", email: "c@x.com" },
        expiresInSeconds: PIX_EXPIRES,
      }),
    );

    // Tip agregado + itens normalizados (driver resolvido do pedido)
    const args = upsert.mock.calls[0]![0];
    expect(args.create.amountCents).toBe(1000);
    expect(args.create.driverId).toBe("d1");
    expect(args.create.items.create).toEqual([
      { target: "platform", targetDriverId: null, targetMerchantId: null, amountCents: 200 },
      { target: "driver", targetDriverId: "d1", targetMerchantId: null, amountCents: 300 },
      { target: "merchant", targetDriverId: null, targetMerchantId: "m1", amountCents: 500 },
    ]);

    expect(view).toMatchObject({ id: "tip1", amountCents: 1000, status: "pending", qrCode: "qr-code" });
    expect(view.items).toHaveLength(3);
  });

  it("recria (re-upsert com deleteMany) uma gorjeta pendente existente", async () => {
    const { svc, upsert } = makeService({ order: order({ tip: { status: "pending" } }) });
    await svc.create("u1", "o1", [platform(200)]);
    const args = upsert.mock.calls[0]![0];
    expect(args.update.items.deleteMany).toEqual({});
    expect(args.update.paidAt).toBeNull();
  });

  it("só plataforma: pedido de retirada aceita a gorjeta à plataforma", async () => {
    const { svc, createPixCharge } = makeService({
      order: order({
        groups: [
          {
            fulfillment: "pickup",
            store: { merchantId: "m1", merchant: { name: "Mercado 1" } },
            delivery: null,
          },
        ],
      }),
    });
    const view = await svc.create("u1", "o1", [platform(200)]);
    expect(createPixCharge).toHaveBeenCalledTimes(1);
    expect(view.amountCents).toBe(200);
  });
});

describe("TipsService.targets", () => {
  it("lista entregador (entrega própria) e mercados do pedido", async () => {
    const { svc } = makeService({ order: order() });
    const out = await svc.targets("u1", "o1");
    expect(out).toEqual({
      orderId: "o1",
      hasDelivery: true,
      driverName: "Entregador",
      merchants: [{ merchantId: "m1", merchantName: "Mercado 1" }],
    });
  });

  it("retirada: sem entregador (hasDelivery false)", async () => {
    const { svc } = makeService({
      order: order({
        groups: [
          {
            fulfillment: "pickup",
            store: { merchantId: "m1", merchant: { name: "Mercado 1" } },
            delivery: null,
          },
        ],
      }),
    });
    const out = await svc.targets("u1", "o1");
    expect(out.hasDelivery).toBe(false);
    expect(out.driverName).toBeNull();
  });

  it("ORDER_NOT_FOUND quando o pedido não é do dono", async () => {
    const { svc } = makeService({ order: order({ userId: "outro" }) });
    await expect(svc.targets("u1", "o1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ORDER_NOT_FOUND" }),
    });
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
      tip: { id: "tip1", order: { userId: "outro" }, items: [] },
    });
    await expect(svc.get("u1", "o1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("retorna a view agregada com itens", async () => {
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
        items: [
          { target: "driver", targetDriverId: "d1", targetMerchantId: null, amountCents: 500 },
        ],
      },
    });
    const view = await svc.get("u1", "o1");
    expect(view).toMatchObject({ id: "tip1", amountCents: 500, status: "paid", qrCode: "qr" });
    expect(view.paidAt).toBe("2026-06-28T11:00:00.000Z");
    expect(view.items).toEqual([
      { target: "driver", targetDriverId: "d1", targetMerchantId: null, amountCents: 500 },
    ]);
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
    const { svc, tipUpdate } = makeService({ tip: { id: "tip1", order: { userId: "u1" } } });
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
