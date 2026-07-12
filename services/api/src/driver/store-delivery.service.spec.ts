import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { StoreDeliveryService } from "./store-delivery.service";

/** Fake mínimo do PrismaService p/ os guards de despacho. */
function makePrisma(over: Record<string, unknown> = {}) {
  return {
    storeStaff: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
    // Story 62: guarda de disponibilidade — driver disponível por padrão.
    user: { findUnique: jest.fn().mockResolvedValue({ driverAvailableAt: new Date() }) },
    delivery: {
      findUnique: jest.fn().mockResolvedValue({ id: "d1", storeId: "store1", status: "unassigned" }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "d1",
        status: "assigned",
        driverId: "drv1",
        assignedAt: new Date(),
        pickedUpAt: null,
        deliveredAt: null,
        createdAt: new Date(),
        storeId: "store1",
        orderGroup: { id: "g1", orderId: "o1", store: { id: "store1", name: "Loja" }, _count: { items: 1 }, order: { deliveryCode: "AB12", addressSnapshot: null, user: { name: "Cli" } } },
        driver: { id: "drv1", name: "Entregador" },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderGroup: { findUnique: jest.fn() },
    ...over,
  } as never;
}

const handoff = { confirmDelivered: jest.fn() } as never;
const tracking = { emit: jest.fn(), build: jest.fn() } as never;
const push = { sendToUser: jest.fn() } as never;

describe("StoreDeliveryService.assign", () => {
  it("atribui com lock otimista (count > 0)", async () => {
    const prisma = makePrisma();
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.assign("mgr", "d1", "drv1")).resolves.toMatchObject({ id: "d1" });
  });

  it("falha se já atribuída (count = 0)", async () => {
    const prisma = makePrisma({
      storeStaff: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
      user: { findUnique: jest.fn().mockResolvedValue({ driverAvailableAt: new Date() }) },
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ id: "d1", storeId: "store1", status: "assigned" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.assign("mgr", "d1", "drv1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa atribuição a driver indisponível (DRIVER_UNAVAILABLE) sem tocar a entrega", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({
      user: { findUnique: jest.fn().mockResolvedValue({ driverAvailableAt: null }) },
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ id: "d1", storeId: "store1", status: "unassigned" }),
        updateMany,
      },
    });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.assign("mgr", "d1", "drv1")).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("recusa quem não é staff da loja", async () => {
    const prisma = makePrisma({ storeStaff: { findFirst: jest.fn().mockResolvedValue(null) } });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.assign("intruso", "d1", "drv1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa driver que não é da loja", async () => {
    const prisma = makePrisma({
      storeStaff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "s1" }) // assertStoreStaff (operador)
          .mockResolvedValueOnce(null), // driver não-vinculado
      },
    });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.assign("mgr", "d1", "drvX")).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * Story 61 — reenvio (retry) de entrega com falha. Só `failed → unassigned`:
 * limpa entregador + timestamps de coleta, PRESERVA a última falha, e devolve o
 * OrderGroup a `ready_for_pickup` (mesma TX). Não-`failed` → DELIVERY_NOT_FAILED.
 */
describe("StoreDeliveryService.retry", () => {
  function makeRetryPrisma(deliveryUpdateCount: number) {
    const deliveryUpdateMany = jest.fn().mockResolvedValue({ count: deliveryUpdateCount });
    const groupUpdate = jest.fn().mockResolvedValue({});
    const tx = { delivery: { updateMany: deliveryUpdateMany }, orderGroup: { update: groupUpdate } };
    const prisma = {
      storeStaff: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ id: "d1", storeId: "store1", orderGroupId: "g1", status: "failed" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "d1",
          status: "unassigned",
          driverId: null,
          assignedAt: null,
          pickedUpAt: null,
          deliveredAt: null,
          failReason: "customer_absent",
          failNote: null,
          failedAt: new Date(),
          createdAt: new Date(),
          storeId: "store1",
          orderGroup: { id: "g1", orderId: "o1", store: { id: "store1", name: "Loja" }, _count: { items: 1 }, order: { deliveryCode: "AB12", addressSnapshot: null, user: { name: "Cli" } } },
          driver: null,
        }),
      },
      orderGroup: { findUnique: jest.fn().mockResolvedValue({ orderId: "o1" }) },
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    } as never;
    return { prisma, deliveryUpdateMany, groupUpdate };
  }

  it("reenvia: failed → unassigned, limpa driver/coleta e volta grupo a ready_for_pickup", async () => {
    const { prisma, deliveryUpdateMany, groupUpdate } = makeRetryPrisma(1);
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.retry("mgr", "d1")).resolves.toMatchObject({ id: "d1" });
    expect(deliveryUpdateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "failed" },
      data: { status: "unassigned", driverId: null, assignedAt: null, pickedUpAt: null },
    });
    expect(groupUpdate).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "ready_for_pickup" } });
  });

  it("preserva o motivo da última falha (não limpa failReason)", async () => {
    const { prisma, deliveryUpdateMany } = makeRetryPrisma(1);
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await svc.retry("mgr", "d1");
    const data = deliveryUpdateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("failReason");
    expect(data).not.toHaveProperty("failNote");
    expect(data).not.toHaveProperty("failedAt");
  });

  it("recusa reenvio de entrega que não está failed (count = 0)", async () => {
    const { prisma } = makeRetryPrisma(0);
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.retry("mgr", "d1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa quem não é staff da loja", async () => {
    const { prisma } = makeRetryPrisma(1);
    (prisma as unknown as { storeStaff: { findFirst: jest.Mock } }).storeStaff.findFirst.mockResolvedValue(null);
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.retry("intruso", "d1")).rejects.toBeInstanceOf(ForbiddenException);
  });
});

/**
 * Story 62 — a lista de entregadores para atribuição inclui o badge de turno:
 * `available` + `availableSince` (todos aparecem; a UI desabilita o indisponível).
 */
describe("StoreDeliveryService.drivers (badge de disponibilidade)", () => {
  it("expõe available/availableSince por entregador", async () => {
    const since = new Date("2026-07-12T09:00:00.000Z");
    const prisma = makePrisma({
      storeStaff: {
        findFirst: jest.fn().mockResolvedValue({ id: "s1" }),
        findMany: jest.fn().mockResolvedValue([
          { user: { id: "drvA", name: "Ana", driverAvailableAt: since } },
          { user: { id: "drvB", name: "Beto", driverAvailableAt: null } },
        ]),
      },
      delivery: { groupBy: jest.fn().mockResolvedValue([{ driverId: "drvA", _count: { _all: 2 } }]) },
    });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    const list = await svc.drivers("mgr", "store1");
    expect(list).toEqual([
      { id: "drvA", name: "Ana", activeDeliveries: 2, available: true, availableSince: "2026-07-12T09:00:00.000Z" },
      { id: "drvB", name: "Beto", activeDeliveries: 0, available: false, availableSince: null },
    ]);
  });
});

describe("StoreDeliveryService.handover", () => {
  it("recusa grupo que não é de retirada (pickup)", async () => {
    const prisma = makePrisma({
      orderGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: "g1", storeId: "store1", fulfillment: "delivery" }),
      },
    });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.handover("mgr", "g1", "AB12")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("confirma retirada de grupo pickup", async () => {
    const confirmDelivered = jest.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({
      orderGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: "g1", storeId: "store1", fulfillment: "pickup" }),
      },
    });
    const svc = new StoreDeliveryService(prisma, { confirmDelivered } as never, tracking, push);
    await expect(svc.handover("mgr", "g1", "AB12")).resolves.toEqual({ delivered: true });
    expect(confirmDelivered).toHaveBeenCalledWith("g1", "AB12");
  });
});
