import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { StoreDeliveryService } from "./store-delivery.service";

/** Fake mínimo do PrismaService p/ os guards de despacho. */
function makePrisma(over: Record<string, unknown> = {}) {
  return {
    storeStaff: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
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
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ id: "d1", storeId: "store1", status: "assigned" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = new StoreDeliveryService(prisma, handoff, tracking, push);
    await expect(svc.assign("mgr", "d1", "drv1")).rejects.toBeInstanceOf(BadRequestException);
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
