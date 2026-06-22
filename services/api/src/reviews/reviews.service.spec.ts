import { NotFoundException } from "@nestjs/common";
import { ReviewsService } from "./reviews.service";

/**
 * Foco C09: avaliações multi-eixo (S5.2) — validação de nota, ownership +
 * pedido entregue + janela, resolução de alvo por eixo (platform/merchant/
 * delivery) e unicidade por eixo/mercado.
 */

const RECENT = new Date(Date.now() - 1000);
const OLD = new Date(Date.now() - 40 * 86400_000);

function makeService(opts: {
  order?: Record<string, unknown> | null;
  existing?: unknown;
}) {
  const create = jest.fn().mockResolvedValue({
    id: "r1",
    orderId: "o1",
    axis: "platform",
    rating: 5,
    comment: null,
    targetMerchantId: null,
    targetDriverId: null,
    createdAt: new Date(),
  });
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null) },
    review: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create,
    },
  } as never;
  const config = { get: jest.fn().mockReturnValue(30) } as never; // REVIEW_WINDOW_DAYS
  const svc = new ReviewsService(prisma, config);
  return { svc, create };
}

function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    userId: "u1",
    status: "delivered",
    updatedAt: RECENT,
    groups: [{ merchantId: "m1", fulfillment: "pickup", delivery: null }],
    ...over,
  };
}

describe("ReviewsService.create", () => {
  it("INVALID_RATING fora de 1..5", async () => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", { axis: "platform", rating: 6 })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_RATING" }),
    });
  });

  it("ORDER_NOT_FOUND quando não é dono", async () => {
    const { svc } = makeService({ order: order({ userId: "outro" }) });
    await expect(
      svc.create("u1", "o1", { axis: "platform", rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ORDER_NOT_DELIVERED quando o pedido não foi entregue", async () => {
    const { svc } = makeService({ order: order({ status: "created" }) });
    await expect(svc.create("u1", "o1", { axis: "platform", rating: 5 })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ORDER_NOT_DELIVERED" }),
    });
  });

  it("REVIEW_WINDOW_CLOSED fora da janela", async () => {
    const { svc } = makeService({ order: order({ updatedAt: OLD }) });
    await expect(svc.create("u1", "o1", { axis: "platform", rating: 5 })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REVIEW_WINDOW_CLOSED" }),
    });
  });

  it("platform: cria sem alvo de merchant/driver", async () => {
    const { svc, create } = makeService({ order: order() });
    await svc.create("u1", "o1", { axis: "platform", rating: 5 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetMerchantId: null, targetDriverId: null }),
      }),
    );
  });

  it("merchant: default = primeiro grupo do pedido", async () => {
    const { svc, create } = makeService({ order: order() });
    await svc.create("u1", "o1", { axis: "merchant", rating: 4 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetMerchantId: "m1" }) }),
    );
  });

  it("merchant: MERCHANT_NOT_IN_ORDER se o mercado não faz parte do pedido", async () => {
    const { svc } = makeService({ order: order() });
    await expect(
      svc.create("u1", "o1", { axis: "merchant", rating: 4, merchantId: "outro" }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "MERCHANT_NOT_IN_ORDER" }) });
  });

  it("delivery: DELIVERY_AXIS_NA sem entregador atribuído", async () => {
    const { svc } = makeService({ order: order() });
    await expect(svc.create("u1", "o1", { axis: "delivery", rating: 5 })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "DELIVERY_AXIS_NA" }),
    });
  });

  it("delivery: resolve driverId de grupo com entrega própria", async () => {
    const { svc, create } = makeService({
      order: order({
        groups: [{ merchantId: "m1", fulfillment: "delivery", delivery: { driverId: "d1" } }],
      }),
    });
    await svc.create("u1", "o1", { axis: "delivery", rating: 5 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetDriverId: "d1" }) }),
    );
  });

  it("ALREADY_REVIEWED quando o eixo já foi avaliado", async () => {
    const { svc } = makeService({ order: order(), existing: { id: "prev" } });
    await expect(svc.create("u1", "o1", { axis: "platform", rating: 5 })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ALREADY_REVIEWED" }),
    });
  });
});
