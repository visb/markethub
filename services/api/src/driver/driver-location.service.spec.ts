import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DriverLocationService } from "./driver-location.service";
import type { DeliveryGateway } from "./delivery.gateway";

/**
 * Story 51: ingest da posição do entregador. Guard: só o dono da entrega e só em
 * trânsito (picked_up). Rate-limit (1 ping/3s por entrega) descarta silencioso.
 * Fan-out via DeliveryGateway na sala do pedido; posição não é persistida.
 */

function makeService(opts: {
  delivery?: { id: string; driverId: string | null; status: string; orderGroupId: string } | null;
  group?: { orderId: string } | null;
}) {
  const publishLocation = jest.fn();
  const prisma = {
    delivery: {
      findUnique: jest.fn().mockResolvedValue(
        opts.delivery === undefined
          ? { id: "d1", driverId: "u1", status: "picked_up", orderGroupId: "g1" }
          : opts.delivery,
      ),
    },
    orderGroup: {
      findUnique: jest.fn().mockResolvedValue(
        opts.group === undefined ? { orderId: "o1" } : opts.group,
      ),
    },
  } as never;
  const gateway = { publishLocation } as unknown as DeliveryGateway;
  const svc = new DriverLocationService(prisma, gateway);
  return { svc, publishLocation, prisma };
}

const ping = { lat: -23.5, lng: -46.6, heading: 90, recordedAt: "2026-07-11T12:00:00.000Z" };

describe("DriverLocationService.ingest", () => {
  it("dono + em trânsito: aceita e faz fan-out na sala do pedido", async () => {
    const { svc, publishLocation } = makeService({});
    const res = await svc.ingest("u1", "d1", ping);
    expect(res).toEqual({ accepted: true });
    expect(publishLocation).toHaveBeenCalledWith("o1", {
      deliveryId: "d1",
      orderId: "o1",
      lat: -23.5,
      lng: -46.6,
      heading: 90,
      recordedAt: "2026-07-11T12:00:00.000Z",
    });
  });

  it("heading ausente vira null no payload", async () => {
    const { svc, publishLocation } = makeService({});
    await svc.ingest("u1", "d1", { lat: 1, lng: 2, recordedAt: "2026-07-11T12:00:00.000Z" });
    expect(publishLocation).toHaveBeenCalledWith(
      "o1",
      expect.objectContaining({ heading: null }),
    );
  });

  it("entrega inexistente: NotFound (DELIVERY_NOT_FOUND)", async () => {
    const { svc, publishLocation } = makeService({ delivery: null });
    await expect(svc.ingest("u1", "d1", ping)).rejects.toBeInstanceOf(NotFoundException);
    expect(publishLocation).not.toHaveBeenCalled();
  });

  it("entrega de outro entregador: Forbidden (NOT_DELIVERY_DRIVER)", async () => {
    const { svc, publishLocation } = makeService({
      delivery: { id: "d1", driverId: "outro", status: "picked_up", orderGroupId: "g1" },
    });
    await expect(svc.ingest("u1", "d1", ping)).rejects.toBeInstanceOf(ForbiddenException);
    expect(publishLocation).not.toHaveBeenCalled();
  });

  it.each(["assigned", "unassigned", "delivered", "canceled"])(
    "estado %s (não em trânsito): BadRequest (DELIVERY_NOT_IN_TRANSIT)",
    async (status) => {
      const { svc, publishLocation } = makeService({
        delivery: { id: "d1", driverId: "u1", status, orderGroupId: "g1" },
      });
      await expect(svc.ingest("u1", "d1", ping)).rejects.toBeInstanceOf(BadRequestException);
      expect(publishLocation).not.toHaveBeenCalled();
    },
  );

  it("grupo sem pedido: NotFound (ORDER_GROUP_NOT_FOUND)", async () => {
    const { svc, publishLocation } = makeService({ group: null });
    await expect(svc.ingest("u1", "d1", ping)).rejects.toBeInstanceOf(NotFoundException);
    expect(publishLocation).not.toHaveBeenCalled();
  });

  it("rate-limit: segundo ping em <3s é descartado silenciosamente", async () => {
    const { svc, publishLocation } = makeService({});
    const first = await svc.ingest("u1", "d1", ping);
    const second = await svc.ingest("u1", "d1", ping);
    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: false });
    expect(publishLocation).toHaveBeenCalledTimes(1);
  });

  it("rate-limit: ping após a janela de 3s é aceito de novo", async () => {
    jest.useFakeTimers();
    try {
      const { svc, publishLocation } = makeService({});
      await svc.ingest("u1", "d1", ping);
      jest.advanceTimersByTime(3_001);
      const again = await svc.ingest("u1", "d1", ping);
      expect(again).toEqual({ accepted: true });
      expect(publishLocation).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("rate-limit é por entrega (outra entrega não é afetada)", async () => {
    const publishLocation = jest.fn();
    const prisma = {
      delivery: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "dX", driverId: "u1", status: "picked_up", orderGroupId: "g1" }),
      },
      orderGroup: { findUnique: jest.fn().mockResolvedValue({ orderId: "o1" }) },
    } as never;
    const svc = new DriverLocationService(prisma, { publishLocation } as unknown as DeliveryGateway);
    const a = await svc.ingest("u1", "dA", ping);
    const b = await svc.ingest("u1", "dB", ping);
    expect(a).toEqual({ accepted: true });
    expect(b).toEqual({ accepted: true });
    expect(publishLocation).toHaveBeenCalledTimes(2);
  });
});
