import { NotFoundException } from "@nestjs/common";
import { OrdersService, type CreateOrderInput } from "./orders.service";

/**
 * Story 21: cobertura do OrdersService — criação do pedido a partir do carrinho,
 * transições válidas/inválidas de status (markPaid) e cancelamento conforme
 * BUSINESS_RULES.md (status ∈ {created,paid,preparing} e nenhuma PickTask além de
 * queued/assigned). Prisma e colaboradores são fake (sem DB). Refund/substituição
 * ficam fora (stories 20/22) — aqui só verificamos a orquestração.
 */

interface ViewItem {
  productId: string;
  offerId: string;
  name: string;
  gtin: string;
  saleType: "unit" | "weight";
  unitPriceCents: number;
  quantity: number;
  weightGrams: number | null;
  available: boolean;
}

const VIEW_GROUP = {
  merchantId: "m1",
  storeId: "store1",
  items: [
    {
      productId: "p1",
      offerId: "offer1",
      name: "Arroz",
      gtin: "789",
      saleType: "unit",
      unitPriceCents: 1000,
      quantity: 2,
      weightGrams: null,
      available: true,
    } as ViewItem,
  ],
};

const VIEW_TOTALS_GROUP = {
  merchantId: "m1",
  subtotalCents: 2000,
  deliveryCents: 700,
  prepCents: 100,
  platformFeeCents: 200,
};

function makeView(over: Partial<typeof VIEW_GROUP> & { available?: boolean } = {}) {
  const group = {
    ...VIEW_GROUP,
    items: VIEW_GROUP.items.map((i) => ({ ...i, available: over.available ?? true })),
  };
  return {
    couponCode: null as string | null,
    itemCount: 1,
    groups: [group],
    totals: {
      groups: [VIEW_TOTALS_GROUP],
      itemsCents: 2000,
      deliveryCents: 700,
      prepCents: 100,
      platformFeeCents: 200,
      discountCents: 0,
      doorSurchargeCents: 0,
      totalCents: 3000,
    },
  };
}

function makeDeps(opts: {
  view?: ReturnType<typeof makeView>;
  address?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  tasks?: { id: string; status: string }[];
  slotWindow?: { start: Date; end: Date };
} = {}) {
  const view = opts.view ?? makeView();

  const tx = {
    order: {
      create: jest.fn().mockResolvedValue({ id: "order1" }),
      update: jest.fn().mockResolvedValue({ id: "order1", status: "canceled" }),
    },
    orderGroup: {
      create: jest.fn().mockResolvedValue({ id: "g1" }),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    pickTask: { deleteMany: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    address: {
      findUnique: jest.fn().mockResolvedValue(opts.address ?? null),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue("order" in opts ? opts.order : null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    orderGroup: { updateMany: jest.fn().mockResolvedValue({}) },
    pickTask: { findMany: jest.fn().mockResolvedValue(opts.tasks ?? []) },
  } as never;

  const cart = {
    getCart: jest.fn().mockResolvedValue(view),
    clear: jest.fn().mockResolvedValue({}),
  };
  const tracking = {
    build: jest.fn().mockResolvedValue({ steps: [] }),
    emit: jest.fn().mockResolvedValue({}),
  };
  const scheduling = {
    reserveInTx: jest.fn().mockResolvedValue(opts.slotWindow ?? { start: new Date(), end: new Date() }),
    release: jest.fn().mockResolvedValue({}),
  };
  const refund = { issueCancelRefund: jest.fn().mockResolvedValue({}) };
  const integration = { emit: jest.fn().mockResolvedValue({}) };
  const orderEvents = { created: jest.fn(), statusChanged: jest.fn() };
  const outbox = { publish: jest.fn().mockResolvedValue({ id: "evt1" }) };

  const svc = new OrdersService(
    prisma,
    cart as never,
    tracking as never,
    scheduling as never,
    refund as never,
    integration as never,
    orderEvents as never,
    outbox as never,
  );
  return { svc, prisma, tx, cart, tracking, scheduling, refund, integration, orderEvents, outbox };
}

const deliveryInput: CreateOrderInput = { fulfillment: "delivery", addressId: "addr1", deliveryMethod: "gate" };
const pickupInput: CreateOrderInput = { fulfillment: "pickup" };
const validAddress = { id: "addr1", userId: "u1", street: "Rua A" };

describe("OrdersService.preview", () => {
  it("delivery: exige endereço e devolve a view com fulfillment", async () => {
    const { svc, cart } = makeDeps({ address: validAddress });
    const res = await svc.preview("u1", deliveryInput);
    expect(cart.getCart).toHaveBeenCalledWith("u1", { doorSurchargeCents: 0, fulfillment: "delivery" });
    expect(res.fulfillment).toBe("delivery");
    expect(res.itemCount).toBe(1);
  });

  it("delivery method door aplica o surcharge no getCart", async () => {
    const { svc, cart } = makeDeps({ address: validAddress });
    await svc.preview("u1", { ...deliveryInput, deliveryMethod: "door" });
    expect(cart.getCart).toHaveBeenCalledWith("u1", { doorSurchargeCents: 400, fulfillment: "delivery" });
  });

  it("pickup: não exige endereço", async () => {
    const { svc, cart } = makeDeps();
    const res = await svc.preview("u1", pickupInput);
    expect(cart.getCart).toHaveBeenCalledWith("u1", { doorSurchargeCents: 0, fulfillment: "pickup" });
    expect(res.fulfillment).toBe("pickup");
  });

  it("carrinho vazio → CART_EMPTY", async () => {
    const empty = makeView();
    empty.itemCount = 0;
    const { svc } = makeDeps({ address: validAddress, view: empty });
    await expect(svc.preview("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "CART_EMPTY" },
    });
  });

  it("delivery sem addressId → ADDRESS_REQUIRED", async () => {
    const { svc } = makeDeps();
    await expect(svc.preview("u1", { fulfillment: "delivery" })).rejects.toMatchObject({
      response: { code: "ADDRESS_REQUIRED" },
    });
  });

  it("endereço de outro usuário → ADDRESS_NOT_FOUND", async () => {
    const { svc } = makeDeps({ address: { id: "addr1", userId: "outro" } });
    await expect(svc.preview("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "ADDRESS_NOT_FOUND" },
    });
  });
});

describe("OrdersService.checkout", () => {
  it("cria pedido + grupos, limpa carrinho e emite eventos", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx, cart, integration, orderEvents } = makeDeps({
      address: validAddress,
      order,
    });
    const res = await svc.checkout("u1", deliveryInput);
    expect(tx.order.create).toHaveBeenCalled();
    expect(tx.orderGroup.create).toHaveBeenCalled();
    expect(cart.clear).toHaveBeenCalledWith("u1");
    expect(integration.emit).toHaveBeenCalledWith("m1", "order.created", expect.objectContaining({ status: "created" }));
    expect(orderEvents.created).toHaveBeenCalled();
    expect(res).toBe(order); // detail() devolve o pedido
  });

  it("calcula lineTotal por peso (weight)", async () => {
    const view = makeView();
    view.groups[0]!.items[0] = {
      ...view.groups[0]!.items[0]!,
      saleType: "weight",
      unitPriceCents: 5000,
      weightGrams: 500,
      quantity: 1,
    };
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({ address: validAddress, order, view });
    await svc.checkout("u1", deliveryInput);
    const groupArg = tx.orderGroup.create.mock.calls[0]![0] as {
      data: { items: { create: { lineTotalCents: number }[] } };
    };
    // R$50,00/kg × 500g = 2500
    expect(groupArg.data.items.create[0]!.lineTotalCents).toBe(2500);
  });

  it("carrinho vazio → CART_EMPTY", async () => {
    const empty = makeView();
    empty.itemCount = 0;
    const { svc } = makeDeps({ address: validAddress, view: empty });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "CART_EMPTY" },
    });
  });

  it("item indisponível no carrinho → ITEM_UNAVAILABLE", async () => {
    const view = makeView({ available: false });
    const { svc } = makeDeps({ address: validAddress, view });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "ITEM_UNAVAILABLE" },
    });
  });

  it("com deliverySlotId reserva a janela no slot (S5.3)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const window = { start: new Date("2026-06-29T10:00:00Z"), end: new Date("2026-06-29T11:00:00Z") };
    const { svc, scheduling } = makeDeps({ address: validAddress, order, slotWindow: window });
    await svc.checkout("u1", { ...deliveryInput, deliverySlotId: "slot1" });
    expect(scheduling.reserveInTx).toHaveBeenCalledWith(expect.anything(), "slot1", ["store1"]);
  });

  it("pickup: cria pedido sem endereço", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({ order });
    await svc.checkout("u1", pickupInput);
    expect(tx.order.create).toHaveBeenCalled();
  });
});

describe("OrdersService.list", () => {
  it("pagina e clampa pageSize ao máximo (50)", async () => {
    const { svc, prisma } = makeDeps();
    await svc.list("u1", { page: 2, pageSize: 999 });
    expect((prisma as never as { order: { findMany: jest.Mock } }).order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50, where: { userId: "u1" } }),
    );
  });

  it("usa defaults quando não passa paginação", async () => {
    const { svc, prisma } = makeDeps();
    await svc.list("u1");
    expect((prisma as never as { order: { findMany: jest.Mock } }).order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });
});

describe("OrdersService.detail", () => {
  it("devolve o pedido do dono", async () => {
    const order = { id: "order1", userId: "u1", status: "created" };
    const { svc } = makeDeps({ order });
    expect(await svc.detail("u1", "order1")).toBe(order);
  });

  it("pedido de outro usuário → ORDER_NOT_FOUND", async () => {
    const { svc } = makeDeps({ order: { id: "order1", userId: "outro" } });
    await expect(svc.detail("u1", "order1")).rejects.toThrow(NotFoundException);
  });

  it("pedido inexistente → ORDER_NOT_FOUND", async () => {
    const { svc } = makeDeps({ order: null });
    await expect(svc.detail("u1", "x")).rejects.toMatchObject({ response: { code: "ORDER_NOT_FOUND" } });
  });
});

describe("OrdersService.getTracking", () => {
  it("valida posse e constrói o rastreio", async () => {
    const order = { id: "order1", userId: "u1", status: "preparing" };
    const { svc, tracking } = makeDeps({ order });
    await svc.getTracking("u1", "order1");
    expect(tracking.build).toHaveBeenCalledWith("order1");
  });

  it("não-dono → ORDER_NOT_FOUND (não constrói rastreio)", async () => {
    const { svc, tracking } = makeDeps({ order: { id: "order1", userId: "outro" } });
    await expect(svc.getTracking("u1", "order1")).rejects.toThrow(NotFoundException);
    expect(tracking.build).not.toHaveBeenCalled();
  });
});

describe("OrdersService.markPaid (transição created→preparing + evento order.paid — story 45)", () => {
  it.each(["created", "paid"])("status=%s → preparing e emite order.paid NA MESMA TX", async (status) => {
    const { svc, prisma, tx, outbox } = makeDeps();
    const p = prisma as never as { order: { findUnique: jest.Mock } };
    p.order.findUnique.mockResolvedValue({ id: "order1", status });

    await svc.markPaid("order1");

    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: "order1" }, data: { status: "preparing" } });
    expect(tx.orderGroup.updateMany).toHaveBeenCalledWith({ where: { orderId: "order1" }, data: { status: "preparing" } });
    // o publish recebe o CLIENT TRANSACIONAL — atômico com a transição
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledWith(tx, {
      type: "order.paid",
      payload: { orderId: "order1" },
      aggregateId: "order1",
    });
  });

  it("não orquestra mais side-effects inline (viraram handlers do evento)", async () => {
    const { svc, prisma, tracking, integration, orderEvents } = makeDeps();
    const p = prisma as never as { order: { findUnique: jest.Mock } };
    p.order.findUnique.mockResolvedValue({ id: "order1", status: "created" });

    await svc.markPaid("order1");

    expect(tracking.emit).not.toHaveBeenCalled();
    expect(integration.emit).not.toHaveBeenCalled();
    expect(orderEvents.statusChanged).not.toHaveBeenCalled();
  });

  it("pedido inexistente: no-op (não transiciona nem emite)", async () => {
    const { svc, prisma, tx, outbox } = makeDeps();
    const p = prisma as never as { order: { findUnique: jest.Mock } };
    p.order.findUnique.mockResolvedValue(null);

    await svc.markPaid("x");

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("status fora de {created,paid}: idempotente — não retransiciona nem reemite", async () => {
    const { svc, prisma, tx, outbox } = makeDeps();
    const p = prisma as never as { order: { findUnique: jest.Mock } };
    p.order.findUnique.mockResolvedValue({ id: "order1", status: "delivered" });

    await svc.markPaid("order1");

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.orderGroup.updateMany).not.toHaveBeenCalled();
    expect(outbox.publish).not.toHaveBeenCalled();
  });
});

describe("OrdersService.cancel (BUSINESS_RULES: cancelamento)", () => {
  function setupCancel(opts: { status: string; tasks?: { id: string; status: string }[]; deliverySlotId?: string }) {
    const order = {
      id: "order1",
      userId: "u1",
      status: opts.status,
      deliverySlotId: opts.deliverySlotId ?? null,
      groups: [{ id: "g1", merchantId: "m1", storeId: "store1" }],
    };
    const deps = makeDeps({ order, tasks: opts.tasks ?? [] });
    // detail() é chamado dentro de cancel — primeira chamada do findUnique devolve o order
    (deps.prisma as never as { order: { findUnique: jest.Mock } }).order.findUnique.mockResolvedValue(order);
    return deps;
  }

  it.each(["created", "paid", "preparing"])("cancela quando status=%s e tasks ainda em fila", async (status) => {
    const { svc, tx, refund, tracking } = setupCancel({ status, tasks: [{ id: "t1", status: "queued" }] });
    const res = await svc.cancel("u1", "order1");
    expect(tx.pickTask.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["t1"] } } });
    expect(tx.orderGroup.updateMany).toHaveBeenCalledWith({ where: { orderId: "order1" }, data: { status: "canceled" } });
    expect(refund.issueCancelRefund).toHaveBeenCalledWith("order1");
    expect(tracking.emit).toHaveBeenCalledWith("order1");
    expect(res).toMatchObject({ status: "canceled" });
  });

  it("status já avançado (picking) → CANNOT_CANCEL", async () => {
    const { svc } = setupCancel({ status: "picking" });
    await expect(svc.cancel("u1", "order1")).rejects.toMatchObject({ response: { code: "CANNOT_CANCEL" } });
  });

  it("separação já iniciada (PickTask além de assigned) → CANNOT_CANCEL", async () => {
    const { svc, tx } = setupCancel({ status: "paid", tasks: [{ id: "t1", status: "picking" }] });
    await expect(svc.cancel("u1", "order1")).rejects.toMatchObject({ response: { code: "CANNOT_CANCEL" } });
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("task em assigned ainda permite cancelar", async () => {
    const { svc } = setupCancel({ status: "paid", tasks: [{ id: "t1", status: "assigned" }] });
    const res = await svc.cancel("u1", "order1");
    expect(res).toMatchObject({ status: "canceled" });
  });

  it("libera o slot reservado ao cancelar", async () => {
    const { svc, scheduling } = setupCancel({ status: "created", deliverySlotId: "slot1" });
    await svc.cancel("u1", "order1");
    expect(scheduling.release).toHaveBeenCalledWith("slot1");
  });

  it("sem tasks: não chama deleteMany de PickTask", async () => {
    const { svc, tx } = setupCancel({ status: "created", tasks: [] });
    await svc.cancel("u1", "order1");
    expect(tx.pickTask.deleteMany).not.toHaveBeenCalled();
  });
});
