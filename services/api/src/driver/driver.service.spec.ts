import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DriverService } from "./driver.service";

const detail = {
  id: "d1",
  status: "delivered",
  driverId: "drv1",
  assignedAt: new Date(),
  pickedUpAt: new Date(),
  deliveredAt: new Date(),
  createdAt: new Date(),
  storeId: "store1",
  orderGroup: {
    id: "g1",
    orderId: "o1",
    store: { id: "store1", name: "Loja" },
    _count: { items: 2 },
    order: { deliveryCode: "AB12", addressSnapshot: null, user: { name: "Cli" } },
  },
  driver: { id: "drv1", name: "Entregador" },
};

function makePrisma(delivery: Record<string, unknown>) {
  return {
    delivery: {
      findUnique: jest.fn().mockResolvedValue(delivery),
      findUniqueOrThrow: jest.fn().mockResolvedValue(detail),
      update: jest.fn().mockResolvedValue({}),
    },
    orderGroup: { findUniqueOrThrow: jest.fn() },
  } as never;
}

const noopOutbox = { publish: jest.fn() } as never;

describe("DriverService.confirmDelivery", () => {
  it("recusa entrega que não é do entregador", async () => {
    const prisma = makePrisma({ id: "d1", driverId: "outro", status: "picked_up" });
    const svc = new DriverService(prisma, { confirmDelivered: jest.fn() } as never, { emit: jest.fn() } as never, noopOutbox);
    await expect(svc.confirmDelivery("drv1", "d1", "AB12")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa se ainda não foi coletada", async () => {
    const prisma = makePrisma({ id: "d1", driverId: "drv1", status: "assigned" });
    const svc = new DriverService(prisma, { confirmDelivered: jest.fn() } as never, { emit: jest.fn() } as never, noopOutbox);
    await expect(svc.confirmDelivery("drv1", "d1", "AB12")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("é idempotente quando já entregue", async () => {
    const confirmDelivered = jest.fn();
    const prisma = makePrisma({ id: "d1", driverId: "drv1", status: "delivered" });
    const svc = new DriverService(prisma, { confirmDelivered } as never, { emit: jest.fn() } as never, noopOutbox);
    await expect(svc.confirmDelivery("drv1", "d1", "AB12")).resolves.toMatchObject({ id: "d1" });
    expect(confirmDelivered).not.toHaveBeenCalled();
  });

  it("confirma entrega quando coletada (valida código via handoff)", async () => {
    const confirmDelivered = jest.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({ id: "d1", driverId: "drv1", status: "picked_up", orderGroupId: "g1" });
    const svc = new DriverService(prisma, { confirmDelivered } as never, { emit: jest.fn() } as never, noopOutbox);
    await svc.confirmDelivery("drv1", "d1", "AB12");
    expect(confirmDelivered).toHaveBeenCalledWith("g1", "AB12");
  });
});

/**
 * Story 62 — turno on/off. O aceite self-service (pool) só é permitido a quem
 * está disponível (em turno). Indisponível → DRIVER_UNAVAILABLE, sem tocar a
 * entrega. A guarda roda depois de confirmar que o ator é entregador da loja.
 */
describe("DriverService.accept (guarda de disponibilidade)", () => {
  function makeAcceptPrisma(driverAvailableAt: Date | null) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      delivery: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "d1", storeId: "store1", status: "unassigned", orderGroupId: "g1" }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(detail),
        updateMany,
      },
      storeStaff: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
      user: { findUnique: jest.fn().mockResolvedValue({ driverAvailableAt }) },
      orderGroup: { findUnique: jest.fn().mockResolvedValue({ orderId: "o1" }) },
    } as never;
    return { prisma, updateMany };
  }

  const tracking = { emit: jest.fn() } as never;

  it("recusa aceite de entregador indisponível (DRIVER_UNAVAILABLE) sem tocar a entrega", async () => {
    const { prisma, updateMany } = makeAcceptPrisma(null);
    const svc = new DriverService(prisma, {} as never, tracking, noopOutbox);
    await expect(svc.accept("drv1", "d1")).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("permite aceite quando disponível (avança a entrega)", async () => {
    const { prisma, updateMany } = makeAcceptPrisma(new Date());
    const svc = new DriverService(prisma, {} as never, tracking, noopOutbox);
    await expect(svc.accept("drv1", "d1")).resolves.toMatchObject({ id: "d1" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "unassigned" },
      data: expect.objectContaining({ status: "assigned", driverId: "drv1" }),
    });
  });
});

/**
 * Story 61 — falha na entrega. Só o entregador DONO e só após a coleta
 * (`picked_up`). Na TX: Delivery → `failed` (motivo + observação) + evento
 * `delivery.failed` no outbox. Idempotente quando já está `failed`.
 */
describe("DriverService.fail", () => {
  function makeFailPrisma(delivery: Record<string, unknown>) {
    const update = jest.fn().mockResolvedValue({});
    const publish = jest.fn().mockResolvedValue({});
    const tx = { delivery: { update } };
    const prisma = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue(delivery),
        findUniqueOrThrow: jest.fn().mockResolvedValue(detail),
        update: jest.fn().mockResolvedValue({}),
      },
      orderGroup: { findUniqueOrThrow: jest.fn().mockResolvedValue({ orderId: "o1" }) },
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    } as never;
    return { prisma, update, publish };
  }

  it("recusa falha de entrega que não é do entregador", async () => {
    const { prisma, publish } = makeFailPrisma({ id: "d1", driverId: "outro", status: "picked_up" });
    const svc = new DriverService(prisma, {} as never, {} as never, { publish } as never);
    await expect(svc.fail("drv1", "d1", "customer_absent")).rejects.toBeInstanceOf(ForbiddenException);
    expect(publish).not.toHaveBeenCalled();
  });

  it("recusa falha antes da coleta (status != picked_up)", async () => {
    const { prisma, publish } = makeFailPrisma({ id: "d1", driverId: "drv1", status: "assigned" });
    const svc = new DriverService(prisma, {} as never, {} as never, { publish } as never);
    await expect(svc.fail("drv1", "d1", "customer_absent")).rejects.toBeInstanceOf(BadRequestException);
    expect(publish).not.toHaveBeenCalled();
  });

  it("é idempotente quando já está failed (não republica evento)", async () => {
    const { prisma, publish } = makeFailPrisma({ id: "d1", driverId: "drv1", status: "failed" });
    const svc = new DriverService(prisma, {} as never, {} as never, { publish } as never);
    await expect(svc.fail("drv1", "d1", "other")).resolves.toMatchObject({ id: "d1" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("marca failed + emite delivery.failed no outbox (mesma TX)", async () => {
    const { prisma, update, publish } = makeFailPrisma({
      id: "d1",
      driverId: "drv1",
      status: "picked_up",
      orderGroupId: "g1",
    });
    const svc = new DriverService(prisma, {} as never, {} as never, { publish } as never);
    await svc.fail("drv1", "d1", "customer_absent", "portão fechado");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          status: "failed",
          failReason: "customer_absent",
          failNote: "portão fechado",
        }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "delivery.failed",
        payload: expect.objectContaining({
          orderId: "o1",
          groupId: "g1",
          deliveryId: "d1",
          reason: "customer_absent",
        }),
      }),
    );
  });
});
