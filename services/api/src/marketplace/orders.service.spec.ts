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
  merchant: "Mercado X",
  storeId: "store1",
  // Config de entrega por loja (story 58): defaults sem mínimo/atingido.
  minOrderCents: null as number | null,
  missingForMinCents: 0,
  allowsPickup: true,
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
    ...over,
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

// Loja sempre aberta: uma faixa 00:00–24:00 em cada dia da semana (story 52) —
// mantém os testes de checkout determinísticos independentes do relógio.
const ALWAYS_OPEN_HOURS = Array.from({ length: 7 }, (_, d) => ({
  dayOfWeek: d,
  opensAt: 0,
  closesAt: 1440,
}));

function makeDeps(opts: {
  view?: ReturnType<typeof makeView>;
  address?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  tasks?: { id: string; status: string }[];
  slotWindow?: { start: Date; end: Date };
  /**
   * Lojas devolvidas por store.findMany. Usado tanto nas checagens
   * STORE_CLOSED/STORE_PAUSED (stories 52/57) quanto no raio de cobertura
   * (story 58) — o mock ignora o `select`, então os objetos carregam os campos
   * dos dois casos (hours/closures/pausedAt + latitude/longitude/deliveryRadiusKm).
   */
  stores?: {
    id: string;
    name: string;
    pausedAt?: Date | null;
    hours: unknown[];
    closures: unknown[];
    latitude?: number | null;
    longitude?: number | null;
    deliveryRadiusKm?: number | null;
    /** Rede da loja (story 69); omitido → rede ativa. */
    merchant?: { active: boolean };
  }[];
} = {}) {
  const view = opts.view ?? makeView();
  const openStores = (
    opts.stores ??
    view.groups.map((g) => ({
      id: g.storeId,
      name: `Loja ${g.storeId}`,
      pausedAt: null,
      hours: ALWAYS_OPEN_HOURS,
      closures: [],
      latitude: null,
      longitude: null,
      deliveryRadiusKm: null,
    }))
    // Rede ativa por padrão (story 69): o guard de checkout lê merchant.active.
  ).map((s) => ({ merchant: { active: true }, ...s }));

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
    store: { findMany: jest.fn().mockResolvedValue(openStores) },
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
  const outbox = { publish: jest.fn().mockResolvedValue({ id: "evt1" }) };

  const svc = new OrdersService(
    prisma,
    cart as never,
    tracking as never,
    scheduling as never,
    outbox as never,
  );
  return { svc, prisma, tx, cart, tracking, scheduling, outbox };
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
  it("cria pedido + grupos, limpa carrinho e emite order.created NA MESMA TX (story 46)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx, cart, outbox } = makeDeps({
      address: validAddress,
      order,
    });
    const res = await svc.checkout("u1", deliveryInput);
    expect(tx.order.create).toHaveBeenCalled();
    expect(tx.orderGroup.create).toHaveBeenCalled();
    expect(cart.clear).toHaveBeenCalledWith("u1");
    // o publish recebe o CLIENT TRANSACIONAL — atômico com a criação do pedido
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledWith(tx, {
      type: "order.created",
      payload: { orderId: "order1" },
      aggregateId: "order1",
    });
    expect(res).toBe(order); // detail() devolve o pedido
  });

  it("falha na TX não emite evento pós-commit nem limpa o carrinho", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, prisma, cart } = makeDeps({ address: validAddress, order });
    (prisma as never as { $transaction: jest.Mock }).$transaction.mockRejectedValue(new Error("db caiu"));
    await expect(svc.checkout("u1", deliveryInput)).rejects.toThrow("db caiu");
    expect(cart.clear).not.toHaveBeenCalled();
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

  // ── Story 52: horário de funcionamento no checkout ──

  it("loja SEM horário configurado → checkout imediato passa (comportamento pré-52)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: validAddress,
      order,
      stores: [{ id: "store1", name: "Sem horário", hours: [], closures: [] }],
    });
    await svc.checkout("u1", deliveryInput);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("loja configurada e fechada agora (fora da janela) → STORE_CLOSED", async () => {
    const now = new Date("2026-06-28T12:00:00Z"); // domingo 09:00 São Paulo
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: validAddress,
      order,
      // aberta só na segunda (dayOfWeek 1); domingo → fechada
      stores: [
        { id: "store1", name: "Europa Centro", hours: [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }], closures: [] },
      ],
    });
    jest.useFakeTimers().setSystemTime(now);
    try {
      await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
        response: { code: "STORE_CLOSED", stores: [{ id: "store1", name: "Europa Centro" }] },
      });
      expect(tx.order.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("loja configurada com fechamento excepcional hoje → STORE_CLOSED", async () => {
    const now = new Date("2026-06-28T12:00:00Z"); // domingo 09:00 São Paulo
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc } = makeDeps({
      address: validAddress,
      order,
      stores: [
        {
          id: "store1",
          name: "Europa Centro",
          hours: ALWAYS_OPEN_HOURS, // aberta todo dia
          closures: [{ date: new Date("2026-06-28T00:00:00Z") }], // mas fechada hoje
        },
      ],
    });
    jest.useFakeTimers().setSystemTime(now);
    try {
      await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
        response: { code: "STORE_CLOSED" },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("agendado com slot futuro válido passa mesmo com a loja fechada por horário (story 52)", async () => {
    const now = new Date("2026-06-28T12:00:00Z"); // domingo 09:00 São Paulo
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const window = { start: new Date("2026-06-29T10:00:00Z"), end: new Date("2026-06-29T11:00:00Z") };
    const { svc, tx } = makeDeps({
      address: validAddress,
      order,
      slotWindow: window,
      // aberta só na segunda → domingo fechada, mas o slot agendado ignora STORE_CLOSED
      stores: [{ id: "store1", name: "Europa Centro", pausedAt: null, hours: [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }], closures: [] }],
    });
    jest.useFakeTimers().setSystemTime(now);
    try {
      await svc.checkout("u1", { ...deliveryInput, deliverySlotId: "slot1" });
      expect(tx.order.create).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("loja pausada (story 57) → STORE_PAUSED no checkout imediato", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: validAddress,
      order,
      stores: [
        { id: "store1", name: "Europa Centro", pausedAt: new Date("2026-06-28T10:00:00Z"), hours: ALWAYS_OPEN_HOURS, closures: [] },
      ],
    });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "STORE_PAUSED", stores: [{ id: "store1", name: "Europa Centro" }] },
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("loja pausada (story 57) bloqueia até o pedido AGENDADO com slot → STORE_PAUSED", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const window = { start: new Date("2026-06-29T10:00:00Z"), end: new Date("2026-06-29T11:00:00Z") };
    const { svc, tx, scheduling } = makeDeps({
      address: validAddress,
      order,
      slotWindow: window,
      stores: [
        { id: "store1", name: "Europa Centro", pausedAt: new Date("2026-06-28T10:00:00Z"), hours: ALWAYS_OPEN_HOURS, closures: [] },
      ],
    });
    await expect(
      svc.checkout("u1", { ...deliveryInput, deliverySlotId: "slot1" }),
    ).rejects.toMatchObject({ response: { code: "STORE_PAUSED" } });
    expect(tx.order.create).not.toHaveBeenCalled();
    // a pausa é checada antes de reservar o slot
    expect(scheduling.reserveInTx).not.toHaveBeenCalled();
  });

  // ── Story 69: rede suspensa bloqueia todo pedido NOVO (imediato e agendado) ──
  it("rede suspensa → MERCHANT_SUSPENDED no checkout imediato, com a(s) loja(s)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: validAddress,
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], merchant: { active: false } },
      ],
    });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "MERCHANT_SUSPENDED", stores: [{ id: "store1", name: "Europa Centro" }] },
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("rede suspensa bloqueia até o pedido AGENDADO com slot → MERCHANT_SUSPENDED", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx, scheduling } = makeDeps({
      address: validAddress,
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], merchant: { active: false } },
      ],
    });
    await expect(
      svc.checkout("u1", { ...deliveryInput, deliverySlotId: "slot1" }),
    ).rejects.toMatchObject({ response: { code: "MERCHANT_SUSPENDED" } });
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(scheduling.reserveInTx).not.toHaveBeenCalled();
  });

  it("rede suspensa tem precedência sobre pausa: MERCHANT_SUSPENDED (não STORE_PAUSED)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc } = makeDeps({
      address: validAddress,
      order,
      stores: [
        {
          id: "store1",
          name: "Europa Centro",
          pausedAt: new Date("2026-06-28T10:00:00Z"),
          hours: ALWAYS_OPEN_HOURS,
          closures: [],
          merchant: { active: false },
        },
      ],
    });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "MERCHANT_SUSPENDED" },
    });
  });

  it("multi-loja: só a loja da rede suspensa entra na mensagem/lista", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc } = makeDeps({
      address: validAddress,
      order,
      stores: [
        { id: "store1", name: "Ativa", hours: ALWAYS_OPEN_HOURS, closures: [] },
        { id: "store2", name: "Suspensa", hours: ALWAYS_OPEN_HOURS, closures: [], merchant: { active: false } },
      ],
    });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "MERCHANT_SUSPENDED", stores: [{ id: "store2", name: "Suspensa" }] },
    });
  });

  it("multi-loja: lista apenas a(s) fechada(s) na mensagem", async () => {
    const now = new Date("2026-06-28T12:00:00Z"); // domingo 09:00 São Paulo
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc } = makeDeps({
      address: validAddress,
      order,
      stores: [
        // aberta (aberta todo dia) e sem fechamento
        { id: "store1", name: "Aberta", hours: ALWAYS_OPEN_HOURS, closures: [] },
        // configurada mas com fechamento excepcional hoje → fechada
        { id: "store2", name: "Fechada", hours: ALWAYS_OPEN_HOURS, closures: [{ date: new Date("2026-06-28T00:00:00Z") }] },
      ],
    });
    jest.useFakeTimers().setSystemTime(now);
    try {
      await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
        response: { code: "STORE_CLOSED", stores: [{ id: "store2", name: "Fechada" }] },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  // ── Story 58: pedido mínimo por grupo + raio de cobertura no checkout ──

  it("grupo abaixo do mínimo → MIN_ORDER_NOT_MET (não cria pedido)", async () => {
    const view = makeView({ minOrderCents: 3000, missingForMinCents: 1000 });
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({ address: validAddress, order, view });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: {
        code: "MIN_ORDER_NOT_MET",
        stores: [{ storeId: "store1", name: "Mercado X", missingCents: 1000 }],
      },
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("mínimo atingido (missingForMinCents 0) → checkout segue", async () => {
    const view = makeView({ minOrderCents: 3000, missingForMinCents: 0 });
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({ address: validAddress, order, view });
    await svc.checkout("u1", deliveryInput);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("retirada ignora o mínimo do grupo (não valida MIN_ORDER)", async () => {
    const view = makeView({ minOrderCents: 3000, missingForMinCents: 1000 });
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({ order, view });
    await svc.checkout("u1", pickupInput);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("raio: distância loja→endereço acima do raio → OUT_OF_DELIVERY_AREA", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    // loja em Curitiba (-25.43,-49.27), endereço ~5km, raio 2km → fora
    const { svc, tx } = makeDeps({
      address: { id: "addr1", userId: "u1", street: "Rua A", latitude: -25.47, longitude: -49.30 },
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], latitude: -25.43, longitude: -49.27, deliveryRadiusKm: 2 },
      ],
    });
    await expect(svc.checkout("u1", deliveryInput)).rejects.toMatchObject({
      response: { code: "OUT_OF_DELIVERY_AREA", stores: [{ id: "store1", name: "Europa Centro" }] },
    });
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it("raio: dentro do raio → checkout segue", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: { id: "addr1", userId: "u1", street: "Rua A", latitude: -25.44, longitude: -49.28 },
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], latitude: -25.43, longitude: -49.27, deliveryRadiusKm: 10 },
      ],
    });
    await svc.checkout("u1", deliveryInput);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("raio: endereço SEM lat/lng cai na validação por cidade (não bloqueia por raio)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: { id: "addr1", userId: "u1", street: "Rua A", latitude: null, longitude: null },
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], latitude: -25.43, longitude: -49.27, deliveryRadiusKm: 1 },
      ],
    });
    await svc.checkout("u1", deliveryInput);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("raio: retirada não valida raio (fora do raio ainda cria)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], latitude: -25.43, longitude: -49.27, deliveryRadiusKm: 1 },
      ],
    });
    await svc.checkout("u1", pickupInput);
    expect(tx.order.create).toHaveBeenCalled();
  });

  it("raio: loja sem raio configurado → sem limite além da cidade (não bloqueia)", async () => {
    const order = { id: "order1", userId: "u1", status: "created", groups: [] };
    const { svc, tx } = makeDeps({
      address: { id: "addr1", userId: "u1", street: "Rua A", latitude: -30.0, longitude: -55.0 },
      order,
      stores: [
        { id: "store1", name: "Europa Centro", hours: ALWAYS_OPEN_HOURS, closures: [], latitude: -25.43, longitude: -49.27, deliveryRadiusKm: null },
      ],
    });
    await svc.checkout("u1", deliveryInput);
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
    const { svc, prisma, tracking } = makeDeps();
    const p = prisma as never as { order: { findUnique: jest.Mock } };
    p.order.findUnique.mockResolvedValue({ id: "order1", status: "created" });

    await svc.markPaid("order1");

    expect(tracking.emit).not.toHaveBeenCalled();
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

describe("OrdersService.cancel (BUSINESS_RULES: cancelamento + evento order.canceled — story 48)", () => {
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

  it.each(["created", "paid", "preparing"])(
    "status=%s e tasks ainda em fila: cancela e emite order.canceled NA MESMA TX",
    async (status) => {
      const { svc, tx, outbox } = setupCancel({ status, tasks: [{ id: "t1", status: "queued" }] });
      const res = await svc.cancel("u1", "order1");
      expect(tx.pickTask.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["t1"] } } });
      expect(tx.orderGroup.updateMany).toHaveBeenCalledWith({ where: { orderId: "order1" }, data: { status: "canceled" } });
      // o publish recebe o CLIENT TRANSACIONAL — atômico com o cancelamento
      expect(outbox.publish).toHaveBeenCalledTimes(1);
      expect(outbox.publish).toHaveBeenCalledWith(tx, {
        type: "order.canceled",
        payload: { orderId: "order1", deliverySlotId: null },
        aggregateId: "order1",
      });
      // resposta imediata preservada: devolve o pedido cancelado
      expect(res).toMatchObject({ status: "canceled" });
    },
  );

  it("pedido com slot: o payload carrega o deliverySlotId (handler liberar-slot usa)", async () => {
    const { svc, outbox } = setupCancel({ status: "created", deliverySlotId: "slot1" });
    await svc.cancel("u1", "order1");
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: { orderId: "order1", deliverySlotId: "slot1" } }),
    );
  });

  it("não orquestra mais side-effects inline (slot/estorno/notificação viraram handlers do evento)", async () => {
    const { svc, scheduling, tracking } = setupCancel({ status: "paid", deliverySlotId: "slot1" });
    await svc.cancel("u1", "order1");
    expect(scheduling.release).not.toHaveBeenCalled();
    expect(tracking.emit).not.toHaveBeenCalled();
  });

  it("status já avançado (picking) → CANNOT_CANCEL sem evento", async () => {
    const { svc, outbox } = setupCancel({ status: "picking" });
    await expect(svc.cancel("u1", "order1")).rejects.toMatchObject({ response: { code: "CANNOT_CANCEL" } });
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("separação já iniciada (PickTask além de assigned) → CANNOT_CANCEL sem evento", async () => {
    const { svc, tx, outbox } = setupCancel({ status: "paid", tasks: [{ id: "t1", status: "picking" }] });
    await expect(svc.cancel("u1", "order1")).rejects.toMatchObject({ response: { code: "CANNOT_CANCEL" } });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("task em assigned ainda permite cancelar", async () => {
    const { svc } = setupCancel({ status: "paid", tasks: [{ id: "t1", status: "assigned" }] });
    const res = await svc.cancel("u1", "order1");
    expect(res).toMatchObject({ status: "canceled" });
  });

  it("sem tasks: não chama deleteMany de PickTask", async () => {
    const { svc, tx } = setupCancel({ status: "created", tasks: [] });
    await svc.cancel("u1", "order1");
    expect(tx.pickTask.deleteMany).not.toHaveBeenCalled();
  });
});

describe("OrdersService.cancelGroup (story 54 — cancelamento por sub-pedido)", () => {
  function makeGroups(over: Partial<{ id: string; status: string }>[] = []) {
    // grupo cancelado 'g1' (o alvo) + demais grupos, com totais p/ rateio
    const base = [
      { id: "g1", status: "paid", subtotalCents: 5000, deliveryCents: 800, prepCents: 100, platformFeeCents: 100 },
      { id: "g2", status: "paid", subtotalCents: 3000, deliveryCents: 800, prepCents: 100, platformFeeCents: 100 },
    ];
    return base.map((g, i) => ({ ...g, ...(over[i] ?? {}) }));
  }

  function setup(opts: {
    groupStatus?: string;
    pickTask?: { id: string; status: string } | null;
    delivery?: { status: string } | null;
    storeId?: string;
    discountCents?: number;
    deliverySlotId?: string | null;
    siblings?: { id: string; status: string; subtotalCents: number; deliveryCents: number; prepCents: number; platformFeeCents: number }[];
  } = {}) {
    const group = {
      id: "g1",
      storeId: opts.storeId ?? "store1",
      status: opts.groupStatus ?? "paid",
      orderId: "order1",
      order: { id: "order1", discountCents: opts.discountCents ?? 0, deliverySlotId: opts.deliverySlotId ?? null },
      pickTask: opts.pickTask ?? null,
      delivery: opts.delivery ?? null,
    };
    const siblings = opts.siblings ?? makeGroups();

    const tx = {
      pickTask: { deleteMany: jest.fn().mockResolvedValue({}) },
      orderGroup: { update: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
      deliverySlot: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      orderGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
        findMany: jest.fn().mockResolvedValue(siblings),
      },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as never;
    const outbox = { publish: jest.fn().mockResolvedValue({ id: "evt1" }) };
    const svc = new OrdersService(prisma, {} as never, {} as never, {} as never, outbox as never);
    return { svc, prisma, tx, outbox };
  }

  it("cancela o grupo, remove a PickTask e emite order.group_canceled NA MESMA TX", async () => {
    const { svc, tx, outbox } = setup({ pickTask: { id: "t1", status: "queued" } });
    const res = await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(tx.pickTask.deleteMany).toHaveBeenCalledWith({ where: { orderGroupId: "g1" } });
    expect(tx.orderGroup.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "canceled" } });
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledWith(tx, {
      type: "order.group_canceled",
      payload: { orderId: "order1", groupId: "g1", amountCents: 6000, reason: "group_canceled" },
      aggregateId: "order1",
    });
    expect(res).toMatchObject({ id: "g1", status: "canceled", orderCanceled: false });
  });

  it("amountCents rateia o cupom (Order-level) proporcional ao total do grupo", async () => {
    // grupo g1 total 6000; g2 total 4000; desconto 1000 → g1 estorna 5400
    const { svc, outbox } = setup({
      discountCents: 1000,
      siblings: [
        { id: "g1", status: "paid", subtotalCents: 6000, deliveryCents: 0, prepCents: 0, platformFeeCents: 0 },
        { id: "g2", status: "paid", subtotalCents: 4000, deliveryCents: 0, prepCents: 0, platformFeeCents: 0 },
      ],
    });
    await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: expect.objectContaining({ amountCents: 5400 }) }),
    );
  });

  it("demais grupos seguem: NÃO cancela o Order nem libera slot quando há outro grupo ativo", async () => {
    const { svc, tx } = setup({ deliverySlotId: "slot1" });
    const res = await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.deliverySlot.updateMany).not.toHaveBeenCalled();
    expect(res).toMatchObject({ orderCanceled: false });
  });

  it("último grupo ativo cancelado → Order vira canceled e libera o slot (sem order.canceled)", async () => {
    const { svc, tx, outbox } = setup({
      deliverySlotId: "slot1",
      siblings: [
        { id: "g1", status: "paid", subtotalCents: 5000, deliveryCents: 0, prepCents: 0, platformFeeCents: 0 },
        { id: "g2", status: "canceled", subtotalCents: 3000, deliveryCents: 0, prepCents: 0, platformFeeCents: 0 },
      ],
    });
    const res = await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: "order1" }, data: { status: "canceled" } });
    expect(tx.deliverySlot.updateMany).toHaveBeenCalledWith({
      where: { id: "slot1", reserved: { gt: 0 } },
      data: { reserved: { decrement: 1 } },
    });
    // só o evento do grupo — não emite order.canceled (evitaria estorno duplicado)
    expect(outbox.publish).toHaveBeenCalledTimes(1);
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "order.group_canceled" }),
    );
    expect(res).toMatchObject({ orderCanceled: true });
  });

  it("último grupo sem slot: cancela o Order sem tocar o slot", async () => {
    const { svc, tx } = setup({
      deliverySlotId: null,
      siblings: [
        { id: "g1", status: "paid", subtotalCents: 5000, deliveryCents: 0, prepCents: 0, platformFeeCents: 0 },
        { id: "g2", status: "canceled", subtotalCents: 3000, deliveryCents: 0, prepCents: 0, platformFeeCents: 0 },
      ],
    });
    await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(tx.order.update).toHaveBeenCalled();
    expect(tx.deliverySlot.updateMany).not.toHaveBeenCalled();
  });

  it.each(["picking", "ready_for_pickup", "on_the_way", "delivered", "canceled"])(
    "status=%s → CANNOT_CANCEL_GROUP sem evento",
    async (status) => {
      const { svc, outbox } = setup({ groupStatus: status });
      await expect(svc.cancelGroup("g1", { storeIds: ["store1"] })).rejects.toMatchObject({
        response: { code: "CANNOT_CANCEL_GROUP" },
      });
      expect(outbox.publish).not.toHaveBeenCalled();
    },
  );

  it("PickTask além de assigned (picking) → CANNOT_CANCEL_GROUP", async () => {
    const { svc } = setup({ pickTask: { id: "t1", status: "picking" } });
    await expect(svc.cancelGroup("g1", { storeIds: ["store1"] })).rejects.toMatchObject({
      response: { code: "CANNOT_CANCEL_GROUP" },
    });
  });

  it("PickTask em assigned ainda permite cancelar", async () => {
    const { svc } = setup({ pickTask: { id: "t1", status: "assigned" } });
    const res = await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(res).toMatchObject({ status: "canceled" });
  });

  // ── Exceção da story 61: entrega falha libera o cancelamento ──

  it("entrega failed LIBERA cancelar mesmo com grupo on_the_way + PickTask avançada", async () => {
    const { svc, tx, outbox } = setup({
      groupStatus: "on_the_way",
      pickTask: { id: "t1", status: "ready_for_pickup" },
      delivery: { status: "failed" },
    });
    const res = await svc.cancelGroup("g1", { storeIds: ["store1"] });
    expect(res).toMatchObject({ id: "g1", status: "canceled" });
    expect(tx.orderGroup.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "canceled" } });
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "order.group_canceled" }),
    );
  });

  it("entrega NÃO failed com grupo on_the_way → segue bloqueado (CANNOT_CANCEL_GROUP)", async () => {
    const { svc, outbox } = setup({
      groupStatus: "on_the_way",
      pickTask: { id: "t1", status: "ready_for_pickup" },
      delivery: { status: "picked_up" },
    });
    await expect(svc.cancelGroup("g1", { storeIds: ["store1"] })).rejects.toMatchObject({
      response: { code: "CANNOT_CANCEL_GROUP" },
    });
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("grupo de loja fora do escopo do ator → 404 (não vaza existência)", async () => {
    const { svc, outbox } = setup({ storeId: "outra-loja" });
    await expect(svc.cancelGroup("g1", { storeIds: ["store1"] })).rejects.toMatchObject({
      response: { code: "ORDER_GROUP_NOT_FOUND" },
    });
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("grupo inexistente → 404", async () => {
    const { svc, prisma } = setup();
    (prisma as never as { orderGroup: { findUnique: jest.Mock } }).orderGroup.findUnique.mockResolvedValue(null);
    await expect(svc.cancelGroup("g1", { storeIds: ["store1"] })).rejects.toMatchObject({
      response: { code: "ORDER_GROUP_NOT_FOUND" },
    });
  });
});

describe("OrdersService.adminCancel (story 67 — cancelamento pelo suporte/admin)", () => {
  function setupAdmin(opts: { status?: string; deliverySlotId?: string | null; missing?: boolean } = {}) {
    const order = opts.missing
      ? null
      : { id: "order1", status: opts.status ?? "paid", deliverySlotId: opts.deliverySlotId ?? null };

    const tx = {
      pickTask: { deleteMany: jest.fn().mockResolvedValue({}) },
      delivery: { updateMany: jest.fn().mockResolvedValue({}) },
      orderGroup: { updateMany: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({ id: "order1", status: "canceled" }) },
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as never;
    const outbox = { publish: jest.fn().mockResolvedValue({ id: "evt1" }) };
    const svc = new OrdersService(prisma, {} as never, {} as never, {} as never, outbox as never);
    return { svc, prisma, tx, outbox };
  }

  it.each(["created", "paid", "preparing", "picking", "ready_for_pickup", "on_the_way"])(
    "status=%s (não-terminal, inclusive on_the_way): cancela tudo e emite order.canceled NA MESMA TX",
    async (status) => {
      const { svc, tx, outbox } = setupAdmin({ status });
      const res = await svc.adminCancel("order1", "cliente pediu");

      // só as tasks ainda na fila saem; as avançadas ficam (histórico da separação)
      expect(tx.pickTask.deleteMany).toHaveBeenCalledWith({
        where: { orderGroup: { orderId: "order1" }, status: { in: ["queued", "assigned"] } },
      });
      // entregas não-terminais viram canceled
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { orderGroup: { orderId: "order1" }, status: { notIn: ["delivered", "canceled"] } },
        data: { status: "canceled" },
      });
      // grupos não-terminais viram canceled (delivered fica como está)
      expect(tx.orderGroup.updateMany).toHaveBeenCalledWith({
        where: { orderId: "order1", status: { notIn: ["delivered", "canceled"] } },
        data: { status: "canceled" },
      });
      expect(tx.order.update).toHaveBeenCalledWith({ where: { id: "order1" }, data: { status: "canceled" } });
      // evento com trilha do admin — atômico com o cancelamento (estorno total via handlers da 48)
      expect(outbox.publish).toHaveBeenCalledTimes(1);
      expect(outbox.publish).toHaveBeenCalledWith(tx, {
        type: "order.canceled",
        payload: { orderId: "order1", deliverySlotId: null, canceledBy: "admin", reason: "cliente pediu" },
        aggregateId: "order1",
      });
      expect(res).toMatchObject({ status: "canceled" });
    },
  );

  it("pedido com slot: o payload carrega o deliverySlotId (handler liberar-slot usa)", async () => {
    const { svc, outbox } = setupAdmin({ status: "paid", deliverySlotId: "slot1" });
    await svc.adminCancel("order1");
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: { orderId: "order1", deliverySlotId: "slot1", canceledBy: "admin", reason: null },
      }),
    );
  });

  it.each(["delivered", "canceled"])("status terminal (%s) → CANNOT_CANCEL sem evento", async (status) => {
    const { svc, tx, outbox } = setupAdmin({ status });
    await expect(svc.adminCancel("order1")).rejects.toMatchObject({ response: { code: "CANNOT_CANCEL" } });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(outbox.publish).not.toHaveBeenCalled();
  });

  it("pedido inexistente → ORDER_NOT_FOUND", async () => {
    const { svc } = setupAdmin({ missing: true });
    await expect(svc.adminCancel("x")).rejects.toBeInstanceOf(NotFoundException);
  });
});
