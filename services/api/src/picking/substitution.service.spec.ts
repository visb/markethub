import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SubstitutionService } from "./substitution.service";

/**
 * Backfill de cobertura (story 22). Substituição de item mexe em valor cobrado:
 * propor substituto (RBAC/estado/validação de oferta), aprovar/recusar do cliente
 * (recalcula totais), item sem substituto e a política de timeout. Sem DB — Prisma
 * e colaboradores mockados no padrão de picking.service.spec / handoff.service.spec.
 */

const TASK = {
  id: "t1",
  pickerId: "u1",
  status: "picking",
  storeId: "s1",
  orderGroupId: "g1",
};

const ITEM = {
  id: "i1",
  pickTaskId: "t1",
  orderItem: { unitPriceCents: 1000, nameSnapshot: "Arroz 5kg" },
};

const OFFER = {
  id: "of1",
  storeId: "s1",
  available: true,
  priceCents: 1200,
  promoPriceCents: null as number | null,
  productId: "p1",
  product: { name: "Arroz Premium 5kg" },
};

function makeService(opts: {
  task?: Record<string, unknown> | null;
  item?: Record<string, unknown> | null;
  offer?: Record<string, unknown> | null;
  group?: Record<string, unknown> | null;
} = {}) {
  const upsert = jest.fn().mockResolvedValue({ id: "sub1" });
  const prisma = {
    pickTask: {
      findUnique: jest.fn().mockResolvedValue("task" in opts ? opts.task : { ...TASK }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ orderGroupId: "g1", storeId: "s1" }),
    },
    pickItem: {
      findFirst: jest.fn().mockResolvedValue("item" in opts ? opts.item : { ...ITEM }),
      update: jest.fn().mockResolvedValue({}),
    },
    offer: {
      findUnique: jest.fn().mockResolvedValue("offer" in opts ? opts.offer : { ...OFFER }),
    },
    substitution: {
      upsert,
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "sub1", approvalStatus: "approved" }),
      update: jest.fn().mockResolvedValue({}),
    },
    orderGroup: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          "group" in opts ? opts.group : { orderId: "o1", order: { userId: "owner1" } },
        ),
    },
    order: { findUnique: jest.fn().mockResolvedValue({ id: "o1", userId: "owner1" }) },
    $transaction: jest.fn().mockResolvedValue([{}, {}]),
  } as never;

  const session = { recalcTotals: jest.fn().mockResolvedValue(undefined) } as never;
  const events = {
    substitutionProposed: jest.fn(),
    substitutionResolved: jest.fn(),
  } as never;
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) } as never;
  const tracking = { emitForGroup: jest.fn().mockResolvedValue(undefined) } as never;

  const svc = new SubstitutionService(prisma, session, events, push, tracking);
  return { svc, prisma, session, events, push, tracking, upsert };
}

describe("SubstitutionService.propose", () => {
  it("PICK_TASK_NOT_FOUND quando a tarefa não existe", async () => {
    const { svc } = makeService({ task: null });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("NOT_TASK_OWNER quando não é o dono da tarefa", async () => {
    const { svc } = makeService({ task: { ...TASK, pickerId: "outro" } });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NOT_TASK_OWNER" }),
    });
  });

  it("PICK_TASK_NOT_PICKING quando a tarefa não está em separação", async () => {
    const { svc } = makeService({ task: { ...TASK, status: "assigned" } });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("PICK_ITEM_NOT_FOUND quando o item não pertence à tarefa", async () => {
    const { svc } = makeService({ item: null });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "PICK_ITEM_NOT_FOUND" }),
    });
  });

  it("INVALID_SUBSTITUTE quando a oferta não existe", async () => {
    const { svc } = makeService({ offer: null });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_SUBSTITUTE" }),
    });
  });

  it("INVALID_SUBSTITUTE quando a oferta é de outra loja", async () => {
    const { svc } = makeService({ offer: { ...OFFER, storeId: "outra" } });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_SUBSTITUTE" }),
    });
  });

  it("SUBSTITUTE_UNAVAILABLE quando a oferta está indisponível", async () => {
    const { svc } = makeService({ offer: { ...OFFER, available: false } });
    await expect(svc.propose("u1", "t1", "i1", "of1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SUBSTITUTE_UNAVAILABLE" }),
    });
  });

  it("sucesso: calcula diff de preço, faz upsert pending, emite evento e push ao dono", async () => {
    const { svc, upsert, events, push } = makeService();
    const sub = await svc.propose("u1", "t1", "i1", "of1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pickItemId: "i1" },
        create: expect.objectContaining({
          unitPriceCents: 1200,
          priceDiffCents: 200,
          approvalStatus: "pending",
        }),
      }),
    );
    expect((events as { substitutionProposed: jest.Mock }).substitutionProposed).toHaveBeenCalled();
    expect((push as { sendToUser: jest.Mock }).sendToUser).toHaveBeenCalledWith(
      "owner1",
      expect.objectContaining({
        title: "Substituição no seu pedido",
        body: expect.stringContaining("Arroz Premium 5kg"),
        data: { orderId: "o1", route: "/track/o1" },
      }),
    );
    expect(sub).toEqual({ id: "sub1" });
  });

  it("re-proposta (upsert.update volta a pending): re-notifica o cliente com push", async () => {
    // upsert resolve na 1ª e na 2ª chamada — cada propose dispara um novo push.
    const { svc, push } = makeService();
    await svc.propose("u1", "t1", "i1", "of1");
    await svc.propose("u1", "t1", "i1", "of2");
    const send = (push as { sendToUser: jest.Mock }).sendToUser;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        title: "Substituição no seu pedido",
        data: { orderId: "o1", route: "/track/o1" },
      }),
    );
  });

  it("usa promoPriceCents quando há promoção (substituto mais barato → diff negativo)", async () => {
    const { svc, upsert } = makeService({
      offer: { ...OFFER, promoPriceCents: 800, priceCents: 1200 },
    });
    await svc.propose("u1", "t1", "i1", "of1");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ unitPriceCents: 800, priceDiffCents: -200 }),
      }),
    );
  });

  it("sem grupo do pedido: não dispara push (best-effort)", async () => {
    const { svc, push } = makeService({ group: null });
    await svc.propose("u1", "t1", "i1", "of1");
    expect((push as { sendToUser: jest.Mock }).sendToUser).not.toHaveBeenCalled();
  });
});

describe("SubstitutionService.listForOrder", () => {
  it("ORDER_NOT_FOUND quando não é dono do pedido", async () => {
    const { svc, prisma } = makeService();
    (prisma as { order: { findUnique: jest.Mock } }).order.findUnique.mockResolvedValue({
      id: "o1",
      userId: "outro",
    });
    await expect(svc.listForOrder("u1", "o1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("mapeia substituições pendentes com nomes/preços originais e do substituto", async () => {
    const { svc, prisma } = makeService();
    (prisma as { order: { findUnique: jest.Mock } }).order.findUnique.mockResolvedValue({
      id: "o1",
      userId: "u1",
    });
    (prisma as { substitution: { findMany: jest.Mock } }).substitution.findMany.mockResolvedValue([
      {
        id: "sub1",
        pickItemId: "i1",
        nameSnapshot: "Arroz Premium",
        unitPriceCents: 1200,
        priceDiffCents: 200,
        approvalStatus: "pending",
        pickItem: { orderItem: { nameSnapshot: "Arroz", unitPriceCents: 1000 } },
      },
    ]);
    const out = await svc.listForOrder("u1", "o1");
    expect(out).toEqual([
      {
        id: "sub1",
        pickItemId: "i1",
        originalName: "Arroz",
        originalUnitPriceCents: 1000,
        substituteName: "Arroz Premium",
        substituteUnitPriceCents: 1200,
        priceDiffCents: 200,
        approvalStatus: "pending",
      },
    ]);
  });
});

describe("SubstitutionService.approve / reject — resolve", () => {
  function withSub(opts: {
    sub?: Record<string, unknown> | null;
    owner?: string;
    resolved?: Record<string, unknown>;
  }) {
    const ctx = makeService();
    const { prisma } = ctx as unknown as {
      prisma: {
        order: { findUnique: jest.Mock };
        substitution: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
        pickItem: { update: jest.Mock };
        pickTask: { findUniqueOrThrow: jest.Mock };
        $transaction: jest.Mock;
      };
    };
    prisma.order.findUnique.mockResolvedValue({ id: "o1", userId: opts.owner ?? "u1" });
    prisma.substitution.findUnique.mockResolvedValue(
      "sub" in opts
        ? opts.sub
        : { id: "sub1", approvalStatus: "pending", pickItemId: "i1", pickItem: { pickTaskId: "t1" } },
    );
    prisma.substitution.findUniqueOrThrow.mockResolvedValue(
      opts.resolved ?? { id: "sub1", approvalStatus: "approved", resolvedAt: new Date() },
    );
    return { ...ctx, prisma };
  }

  it("ORDER_NOT_FOUND quando não é dono", async () => {
    const { svc } = withSub({ owner: "outro" });
    await expect(svc.approve("u1", "o1", "sub1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("SUBSTITUTION_NOT_FOUND quando não existe", async () => {
    const { svc } = withSub({ sub: null });
    await expect(svc.approve("u1", "o1", "sub1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SUBSTITUTION_NOT_FOUND" }),
    });
  });

  it("idempotente: já resolvida retorna sem re-transicionar", async () => {
    const { svc, prisma, session } = withSub({
      sub: { id: "sub1", approvalStatus: "approved", pickItemId: "i1", pickItem: { pickTaskId: "t1" } },
    });
    const out = await svc.approve("u1", "o1", "sub1");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect((session as { recalcTotals: jest.Mock }).recalcTotals).not.toHaveBeenCalled();
    expect((out as { approvalStatus: string }).approvalStatus).toBe("approved");
  });

  it("aprovar: item → substituted, recalcula totais, emite evento e snapshot", async () => {
    const { svc, prisma, session, events, tracking } = withSub({});
    await svc.approve("u1", "o1", "sub1");
    expect(prisma.substitution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: "approved" }) }),
    );
    expect(prisma.pickItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "substituted" } }),
    );
    expect((session as { recalcTotals: jest.Mock }).recalcTotals).toHaveBeenCalledWith("g1");
    expect((events as { substitutionResolved: jest.Mock }).substitutionResolved).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: "approved", storeId: "s1", orderGroupId: "g1" }),
    );
    expect((tracking as { emitForGroup: jest.Mock }).emitForGroup).toHaveBeenCalledWith("g1");
  });

  it("recusar: item → refused", async () => {
    const { svc, prisma } = withSub({
      resolved: { id: "sub1", approvalStatus: "rejected" },
    });
    await svc.reject("u1", "o1", "sub1");
    expect(prisma.pickItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "refused" } }),
    );
  });
});

describe("SubstitutionService.resolveExpired — política de timeout", () => {
  function withExpired(subs: Array<Record<string, unknown>>) {
    const ctx = makeService();
    const prisma = (ctx as unknown as {
      prisma: {
        substitution: { findMany: jest.Mock; findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
        pickTask: { findUniqueOrThrow: jest.Mock };
      };
    }).prisma;
    prisma.substitution.findMany.mockResolvedValue(subs);
    return { ...ctx, prisma };
  }

  it("sem pendentes expiradas: retorna 0 e não resolve nada", async () => {
    const { svc, session } = withExpired([]);
    const n = await svc.resolveExpired();
    expect(n).toBe(0);
    expect((session as { recalcTotals: jest.Mock }).recalcTotals).not.toHaveBeenCalled();
  });

  it("aceita o mais barato (diff<=0) e remove o mais caro (diff>0)", async () => {
    const { svc, prisma, events } = withExpired([
      { id: "cheap", priceDiffCents: -50 },
      { id: "pricey", priceDiffCents: 300 },
    ]);
    // resolve() recarrega cada substituição pendente
    prisma.substitution.findUnique
      .mockResolvedValueOnce({
        id: "cheap",
        approvalStatus: "pending",
        pickItemId: "i1",
        pickItem: { pickTaskId: "t1" },
      })
      .mockResolvedValueOnce({
        id: "pricey",
        approvalStatus: "pending",
        pickItemId: "i2",
        pickItem: { pickTaskId: "t1" },
      });
    const n = await svc.resolveExpired();
    expect(n).toBe(2);
    const decisions = (events as { substitutionResolved: jest.Mock }).substitutionResolved.mock.calls.map(
      (c) => c[0].approvalStatus,
    );
    expect(decisions).toEqual(["approved", "rejected"]);
  });

  it("erro ao resolver uma não interrompe as demais (best-effort)", async () => {
    const { svc, prisma } = withExpired([{ id: "boom", priceDiffCents: -10 }]);
    prisma.substitution.findUnique.mockRejectedValue(new Error("db down"));
    const n = await svc.resolveExpired();
    expect(n).toBe(1); // conta as expiradas mesmo que a resolução falhe
  });
});
