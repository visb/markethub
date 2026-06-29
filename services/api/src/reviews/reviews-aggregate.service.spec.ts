import { ReviewsAggregateService } from "./reviews-aggregate.service";

/**
 * Backfill de cobertura (story 28). Prisma mockado — sem DB. Cobre as médias
 * por eixo (platform/merchant/delivery), o total de gorjetas pagas (com e sem
 * período) e o arredondamento/fallback de média sem avaliações.
 */

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    review: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }),
    },
    tip: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { amountCents: null }, _count: { _all: 0 } }),
    },
    ...over,
  } as never;
}

describe("ReviewsAggregateService.platform", () => {
  it("calcula média do eixo platform com arredondamento a 2 casas", async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValue({ _avg: { rating: 4.3333 }, _count: { _all: 3 } });
    const prisma = makePrisma({ review: { aggregate } });
    const out = await new ReviewsAggregateService(prisma).platform();
    expect(out).toEqual({ axis: "platform", average: 4.33, count: 3 });
    expect(aggregate.mock.calls[0][0].where).toEqual({ axis: "platform" });
  });

  it("média 0 quando não há avaliações", async () => {
    const out = await new ReviewsAggregateService(makePrisma()).platform();
    expect(out).toEqual({ axis: "platform", average: 0, count: 0 });
  });
});

describe("ReviewsAggregateService.merchant", () => {
  it("retorna médias dos eixos merchant e delivery do mercado", async () => {
    const aggregate = jest
      .fn()
      .mockResolvedValueOnce({ _avg: { rating: 5 }, _count: { _all: 2 } })
      .mockResolvedValueOnce({ _avg: { rating: 4 }, _count: { _all: 1 } });
    const prisma = makePrisma({ review: { aggregate } });
    const out = await new ReviewsAggregateService(prisma).merchant("m1");
    expect(out).toEqual({
      merchant: { axis: "merchant", average: 5, count: 2 },
      delivery: { axis: "delivery", average: 4, count: 1 },
    });
    expect(aggregate.mock.calls[0][0].where).toEqual({
      axis: "merchant",
      targetMerchantId: "m1",
    });
    expect(aggregate.mock.calls[1][0].where).toEqual({
      axis: "delivery",
      targetMerchantId: "m1",
    });
  });
});

describe("ReviewsAggregateService.driver", () => {
  it("retorna nota de entrega e total de gorjetas", async () => {
    const reviewAgg = jest
      .fn()
      .mockResolvedValue({ _avg: { rating: 4.5 }, _count: { _all: 4 } });
    const tipAgg = jest
      .fn()
      .mockResolvedValue({ _sum: { amountCents: 2500 }, _count: { _all: 5 } });
    const prisma = makePrisma({
      review: { aggregate: reviewAgg },
      tip: { aggregate: tipAgg },
    });
    const out = await new ReviewsAggregateService(prisma).driver("d1");
    expect(out).toEqual({
      rating: { axis: "delivery", average: 4.5, count: 4 },
      tips: { totalCents: 2500, count: 5 },
    });
    expect(reviewAgg.mock.calls[0][0].where).toEqual({
      axis: "delivery",
      targetDriverId: "d1",
    });
  });
});

describe("ReviewsAggregateService.tipsTotal", () => {
  it("soma gorjetas pagas do entregador sem período", async () => {
    const tipAgg = jest
      .fn()
      .mockResolvedValue({ _sum: { amountCents: 800 }, _count: { _all: 2 } });
    const prisma = makePrisma({ tip: { aggregate: tipAgg } });
    const out = await new ReviewsAggregateService(prisma).tipsTotal("d1");
    expect(out).toEqual({ totalCents: 800, count: 2 });
    expect(tipAgg.mock.calls[0][0].where).toEqual({ driverId: "d1", status: "paid" });
  });

  it("totalCents 0 quando não há gorjetas", async () => {
    const out = await new ReviewsAggregateService(makePrisma()).tipsTotal("d1");
    expect(out).toEqual({ totalCents: 0, count: 0 });
  });

  it("filtra por período quando from/to informados", async () => {
    const tipAgg = jest
      .fn()
      .mockResolvedValue({ _sum: { amountCents: 0 }, _count: { _all: 0 } });
    const prisma = makePrisma({ tip: { aggregate: tipAgg } });
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    await new ReviewsAggregateService(prisma).tipsTotal("d1", { from, to });
    expect(tipAgg.mock.calls[0][0].where.paidAt).toEqual({ gte: from, lte: to });
  });

  it("período só com from", async () => {
    const tipAgg = jest
      .fn()
      .mockResolvedValue({ _sum: { amountCents: 0 }, _count: { _all: 0 } });
    const prisma = makePrisma({ tip: { aggregate: tipAgg } });
    const from = new Date("2026-01-01");
    await new ReviewsAggregateService(prisma).tipsTotal("d1", { from });
    expect(tipAgg.mock.calls[0][0].where.paidAt).toEqual({ gte: from });
  });
});
