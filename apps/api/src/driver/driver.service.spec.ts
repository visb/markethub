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

describe("DriverService.confirmDelivery", () => {
  it("recusa entrega que não é do entregador", async () => {
    const prisma = makePrisma({ id: "d1", driverId: "outro", status: "picked_up" });
    const svc = new DriverService(prisma, { confirmDelivered: jest.fn() } as never);
    await expect(svc.confirmDelivery("drv1", "d1", "AB12")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("recusa se ainda não foi coletada", async () => {
    const prisma = makePrisma({ id: "d1", driverId: "drv1", status: "assigned" });
    const svc = new DriverService(prisma, { confirmDelivered: jest.fn() } as never);
    await expect(svc.confirmDelivery("drv1", "d1", "AB12")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("é idempotente quando já entregue", async () => {
    const confirmDelivered = jest.fn();
    const prisma = makePrisma({ id: "d1", driverId: "drv1", status: "delivered" });
    const svc = new DriverService(prisma, { confirmDelivered } as never);
    await expect(svc.confirmDelivery("drv1", "d1", "AB12")).resolves.toMatchObject({ id: "d1" });
    expect(confirmDelivered).not.toHaveBeenCalled();
  });

  it("confirma entrega quando coletada (valida código via handoff)", async () => {
    const confirmDelivered = jest.fn().mockResolvedValue(undefined);
    const prisma = makePrisma({ id: "d1", driverId: "drv1", status: "picked_up", orderGroupId: "g1" });
    const svc = new DriverService(prisma, { confirmDelivered } as never);
    await svc.confirmDelivery("drv1", "d1", "AB12");
    expect(confirmDelivered).toHaveBeenCalledWith("g1", "AB12");
  });
});
