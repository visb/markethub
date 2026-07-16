import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ReviewsModerationService } from "./reviews-moderation.service";

/**
 * Story 68 — moderação de avaliações pelo admin. Foco: listagem plana com cada
 * filtro, hide (motivo obrigatório, idempotência, hiddenById gravado), unhide
 * (idempotente, limpa a trilha) e resolução dos nomes (merchant/quem ocultou).
 */

function row(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    orderId: "o1",
    axis: "merchant",
    rating: 2,
    comment: "péssimo",
    replyText: null,
    repliedAt: null,
    createdAt: new Date("2026-07-10T12:00:00Z"),
    targetMerchantId: "m1",
    hiddenAt: null,
    hiddenById: null,
    hiddenReason: null,
    order: { user: { name: "Ana Maria Souza" } },
    ...over,
  };
}

function makePrisma(over: {
  review?: Record<string, unknown>;
  merchant?: Record<string, unknown>;
  user?: Record<string, unknown>;
} = {}) {
  return {
    review: {
      findMany: jest.fn().mockResolvedValue([row()]),
      findUnique: jest.fn().mockResolvedValue(row()),
      update: jest.fn().mockResolvedValue(row()),
      ...over.review,
    },
    merchant: {
      findMany: jest.fn().mockResolvedValue([{ id: "m1", name: "Rede A" }]),
      ...over.merchant,
    },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: "admin1", name: "Alice Admin" }]),
      ...over.user,
    },
  } as never;
}

type Mocked = {
  review: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  merchant: { findMany: jest.Mock };
  user: { findMany: jest.Mock };
};

describe("ReviewsModerationService.list", () => {
  it("sem filtros lista tudo (where vazio), mais recente primeiro", async () => {
    const prisma = makePrisma();
    const res = await new ReviewsModerationService(prisma).list();
    const p = prisma as unknown as Mocked;
    expect(p.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { createdAt: "desc" } }),
    );
    expect(res[0]).toMatchObject({
      id: "r1",
      orderId: "o1",
      authorName: "Ana Maria Souza",
      merchantName: "Rede A",
      hidden: false,
      hiddenAt: null,
    });
  });

  it("aplica cada filtro: rating, hidden=true, merchantId e q (case-insensitive)", async () => {
    const prisma = makePrisma();
    await new ReviewsModerationService(prisma).list({
      rating: 2,
      hidden: true,
      merchantId: "m1",
      q: "péssimo",
    });
    const p = prisma as unknown as Mocked;
    expect(p.review.findMany.mock.calls[0][0].where).toEqual({
      rating: 2,
      hiddenAt: { not: null },
      targetMerchantId: "m1",
      comment: { contains: "péssimo", mode: "insensitive" },
    });
  });

  it("hidden=false filtra só as visíveis (hiddenAt null)", async () => {
    const prisma = makePrisma();
    await new ReviewsModerationService(prisma).list({ hidden: false });
    const p = prisma as unknown as Mocked;
    expect(p.review.findMany.mock.calls[0][0].where).toEqual({ hiddenAt: null });
  });

  it("resolve nome de quem ocultou e expõe motivo/estado da oculta", async () => {
    const hidden = row({
      hiddenAt: new Date("2026-07-15T00:00:00Z"),
      hiddenById: "admin1",
      hiddenReason: "ofensa",
    });
    const prisma = makePrisma({ review: { findMany: jest.fn().mockResolvedValue([hidden]) } });
    const res = await new ReviewsModerationService(prisma).list({ hidden: true });
    expect(res[0]).toMatchObject({
      hidden: true,
      hiddenAt: "2026-07-15T00:00:00.000Z",
      hiddenReason: "ofensa",
      hiddenByName: "Alice Admin",
    });
    const p = prisma as unknown as Mocked;
    expect(p.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["admin1"] } } }),
    );
  });

  it("sem merchant alvo (eixo platform) não consulta merchants; autor ausente vira 'Cliente'", async () => {
    const platform = row({ axis: "platform", targetMerchantId: null, order: { user: null } });
    const prisma = makePrisma({ review: { findMany: jest.fn().mockResolvedValue([platform]) } });
    const res = await new ReviewsModerationService(prisma).list();
    expect(res[0]).toMatchObject({ merchantId: null, merchantName: null, authorName: "Cliente" });
    const p = prisma as unknown as Mocked;
    expect(p.merchant.findMany).not.toHaveBeenCalled();
    expect(p.user.findMany).not.toHaveBeenCalled();
  });
});

describe("ReviewsModerationService.hide", () => {
  it("motivo vazio/branco → 400 HIDE_REASON_REQUIRED sem tocar o banco", async () => {
    const prisma = makePrisma();
    const svc = new ReviewsModerationService(prisma);
    await expect(svc.hide("r1", "admin1", "   ")).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.hide("r1", "admin1", "")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HIDE_REASON_REQUIRED" }),
    });
    const p = prisma as unknown as Mocked;
    expect(p.review.update).not.toHaveBeenCalled();
  });

  it("review inexistente → 404 REVIEW_NOT_FOUND", async () => {
    const prisma = makePrisma({ review: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(
      new ReviewsModerationService(prisma).hide("rx", "admin1", "spam"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REVIEW_NOT_FOUND" }),
    });
  });

  it("oculta gravando hiddenAt + hiddenById do admin + motivo (trim)", async () => {
    const updated = row({
      hiddenAt: new Date("2026-07-16T10:00:00Z"),
      hiddenById: "admin1",
      hiddenReason: "spam",
    });
    const update = jest.fn().mockResolvedValue(updated);
    const prisma = makePrisma({ review: { update } });
    const res = await new ReviewsModerationService(prisma).hide("r1", "admin1", "  spam  ");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: { hiddenAt: expect.any(Date), hiddenById: "admin1", hiddenReason: "spam" },
      }),
    );
    expect(res).toMatchObject({ hidden: true, hiddenReason: "spam", hiddenByName: "Alice Admin" });
  });

  it("idempotente: já oculta devolve como está sem sobrescrever a trilha", async () => {
    const already = row({
      hiddenAt: new Date("2026-07-15T00:00:00Z"),
      hiddenById: "admin1",
      hiddenReason: "ofensa",
    });
    const prisma = makePrisma({ review: { findUnique: jest.fn().mockResolvedValue(already) } });
    const res = await new ReviewsModerationService(prisma).hide("r1", "admin2", "outro motivo");
    const p = prisma as unknown as Mocked;
    expect(p.review.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ hidden: true, hiddenReason: "ofensa", hiddenByName: "Alice Admin" });
  });
});

describe("ReviewsModerationService.unhide", () => {
  it("reexibe limpando hiddenAt/hiddenById/hiddenReason", async () => {
    const hidden = row({
      hiddenAt: new Date("2026-07-15T00:00:00Z"),
      hiddenById: "admin1",
      hiddenReason: "ofensa",
    });
    const update = jest.fn().mockResolvedValue(row());
    const prisma = makePrisma({
      review: { findUnique: jest.fn().mockResolvedValue(hidden), update },
    });
    const res = await new ReviewsModerationService(prisma).unhide("r1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: { hiddenAt: null, hiddenById: null, hiddenReason: null },
      }),
    );
    expect(res).toMatchObject({ hidden: false, hiddenAt: null, hiddenReason: null });
  });

  it("idempotente: visível devolve como está sem update", async () => {
    const prisma = makePrisma();
    const res = await new ReviewsModerationService(prisma).unhide("r1");
    const p = prisma as unknown as Mocked;
    expect(p.review.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ id: "r1", hidden: false });
  });

  it("review inexistente → 404", async () => {
    const prisma = makePrisma({ review: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(new ReviewsModerationService(prisma).unhide("rx")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
