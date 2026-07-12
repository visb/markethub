import { NotFoundException } from "@nestjs/common";
import { ReviewsManagementService } from "./reviews-management.service";

/**
 * Story 56 — vitrine pública + gestão/resposta de avaliações da rede. Foco:
 * paginação e média da vitrine, review sem comentário aparece, filtros de
 * gestão, e resposta (alvo alheio → 404, sobrescreve, carimba repliedAt).
 */

function row(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    rating: 4,
    comment: "bom",
    replyText: null,
    repliedAt: null,
    createdAt: new Date("2026-07-10T12:00:00Z"),
    targetMerchantId: "m1",
    order: { user: { name: "Ana Maria Souza" } },
    ...over,
  };
}

/** `reviewOver` sobrescreve os mocks do delegate `prisma.review`. */
function makePrisma(reviewOver: Record<string, unknown> = {}) {
  return {
    review: {
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4 }, _count: { _all: 2 } }),
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(row({ replyText: "obrigado", repliedAt: new Date() })),
      ...reviewOver,
    },
  } as never;
}

describe("ReviewsManagementService.storeReviews", () => {
  it("devolve média (2 casas), contagem e itens da rede (eixo merchant)", async () => {
    const prisma = makePrisma({
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.333 }, _count: { _all: 12 } }),
      findMany: jest.fn().mockResolvedValue([row()]),
    });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.storeReviews("m1", 1);
    expect(res.average).toBe(4.33);
    expect(res.count).toBe(12);
    expect(res.items[0]).toMatchObject({ rating: 4, comment: "bom", authorName: "Ana" });
    const p = prisma as unknown as { review: { aggregate: jest.Mock } };
    expect(p.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { axis: "merchant", targetMerchantId: "m1" } }),
    );
  });

  it("pagina: page 2 aplica skip = pageSize", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }),
      findMany,
    });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.storeReviews("m1", 2);
    expect(res.page).toBe(2);
    expect(res.average).toBe(0);
    expect(res.count).toBe(0);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it("page inválida (0/negativa) cai para 1 (skip 0)", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }),
      findMany,
    });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.storeReviews("m1", 0);
    expect(res.page).toBe(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
  });

  it("review SEM comentário aparece com rating (comment null)", async () => {
    const prisma = makePrisma({
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 1 } }),
      findMany: jest.fn().mockResolvedValue([row({ comment: null, rating: 5 })]),
    });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.storeReviews("m1");
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ comment: null, rating: 5 });
  });

  it("autor sem nome vira 'Cliente' e resposta exposta quando existe", async () => {
    const prisma = makePrisma({
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 3 }, _count: { _all: 1 } }),
      findMany: jest
        .fn()
        .mockResolvedValue([
          row({ order: { user: null }, replyText: "valeu", repliedAt: new Date("2026-07-11T00:00:00Z") }),
        ]),
    });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.storeReviews("m1");
    expect(res.items[0].authorName).toBe("Cliente");
    expect(res.items[0].replyText).toBe("valeu");
    expect(res.items[0].repliedAt).toBe("2026-07-11T00:00:00.000Z");
  });
});

describe("ReviewsManagementService.listForManagement", () => {
  it("escopo vazio → lista vazia sem tocar o banco", async () => {
    const prisma = makePrisma();
    const svc = new ReviewsManagementService(prisma);
    expect(await svc.listForManagement([], {})).toEqual([]);
    expect(
      (prisma as unknown as { review: { findMany: jest.Mock } }).review.findMany,
    ).not.toHaveBeenCalled();
  });

  it("aplica filtros rating + unanswered e inclui merchantId no item", async () => {
    const findMany = jest.fn().mockResolvedValue([row()]);
    const prisma = makePrisma({ findMany });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.listForManagement(["m1", "m2"], { rating: 4, unanswered: true });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          axis: "merchant",
          targetMerchantId: { in: ["m1", "m2"] },
          rating: 4,
          replyText: null,
        },
      }),
    );
    expect(res[0]).toMatchObject({ merchantId: "m1", authorName: "Ana" });
  });

  it("sem filtros: só eixo merchant nas redes do escopo", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({ findMany });
    const svc = new ReviewsManagementService(prisma);
    await svc.listForManagement(["m1"], {});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { axis: "merchant", targetMerchantId: { in: ["m1"] } },
      }),
    );
  });
});

describe("ReviewsManagementService.reply", () => {
  it("alvo alheio (rede fora do escopo) → 404", async () => {
    const prisma = makePrisma({
      findUnique: jest.fn().mockResolvedValue({ id: "r1", axis: "merchant", targetMerchantId: "outra" }),
    });
    const svc = new ReviewsManagementService(prisma);
    await expect(svc.reply(["m1"], "r1", "oi")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("review inexistente → 404", async () => {
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null) });
    const svc = new ReviewsManagementService(prisma);
    await expect(svc.reply(["m1"], "rx", "oi")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REVIEW_NOT_FOUND" }),
    });
  });

  it("eixo != merchant → 404 (só review de rede é respondível)", async () => {
    const prisma = makePrisma({
      findUnique: jest.fn().mockResolvedValue({ id: "r1", axis: "platform", targetMerchantId: "m1" }),
    });
    const svc = new ReviewsManagementService(prisma);
    await expect(svc.reply(["m1"], "r1", "oi")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("sobrescreve a resposta (trim) e carimba repliedAt", async () => {
    const update = jest.fn().mockResolvedValue(row({ replyText: "obrigado", repliedAt: new Date() }));
    const prisma = makePrisma({
      findUnique: jest.fn().mockResolvedValue({ id: "r1", axis: "merchant", targetMerchantId: "m1" }),
      update,
    });
    const svc = new ReviewsManagementService(prisma);
    const res = await svc.reply(["m1"], "r1", "  obrigado  ");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ replyText: "obrigado", repliedAt: expect.any(Date) }),
      }),
    );
    expect(res).toMatchObject({ merchantId: "m1", replyText: "obrigado" });
  });
});
