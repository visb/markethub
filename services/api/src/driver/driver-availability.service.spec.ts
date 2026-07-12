import { BadRequestException } from "@nestjs/common";
import {
  DriverAvailabilityService,
  assertDriverAvailable,
  toAvailabilityView,
} from "./driver-availability.service";

/** Fake mínimo do PrismaService para o turno on/off. */
function makePrisma(driverAvailableAt: Date | null) {
  const update = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue({ driverAvailableAt });
  const prisma = { user: { findUnique, update } } as never;
  return { prisma, update, findUnique };
}

describe("toAvailabilityView", () => {
  it("mapeia null → indisponível", () => {
    expect(toAvailabilityView(null)).toEqual({ available: false, availableSince: null });
  });

  it("mapeia timestamp → disponível desde (ISO)", () => {
    const at = new Date("2026-07-12T10:00:00.000Z");
    expect(toAvailabilityView(at)).toEqual({
      available: true,
      availableSince: "2026-07-12T10:00:00.000Z",
    });
  });
});

describe("DriverAvailabilityService.current", () => {
  it("retorna indisponível quando driverAvailableAt é null", async () => {
    const { prisma } = makePrisma(null);
    const svc = new DriverAvailabilityService(prisma);
    await expect(svc.current("u1")).resolves.toEqual({ available: false, availableSince: null });
  });

  it("retorna disponível + desde quando há timestamp", async () => {
    const at = new Date("2026-07-12T10:00:00.000Z");
    const { prisma } = makePrisma(at);
    const svc = new DriverAvailabilityService(prisma);
    await expect(svc.current("u1")).resolves.toEqual({
      available: true,
      availableSince: "2026-07-12T10:00:00.000Z",
    });
  });

  it("trata usuário inexistente como indisponível", async () => {
    const { prisma, findUnique } = makePrisma(null);
    findUnique.mockResolvedValueOnce(null);
    const svc = new DriverAvailabilityService(prisma);
    await expect(svc.current("u1")).resolves.toEqual({ available: false, availableSince: null });
  });
});

describe("DriverAvailabilityService.set", () => {
  it("liga o turno quando estava desligado (grava now)", async () => {
    const { prisma, update } = makePrisma(null);
    const svc = new DriverAvailabilityService(prisma);
    const res = await svc.set("u1", true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { driverAvailableAt: expect.any(Date) },
    });
    expect(res.available).toBe(true);
    expect(res.availableSince).toEqual(expect.any(String));
  });

  it("ligar quando já ligado é idempotente e PRESERVA o desde (não grava)", async () => {
    const at = new Date("2026-07-12T08:00:00.000Z");
    const { prisma, update } = makePrisma(at);
    const svc = new DriverAvailabilityService(prisma);
    const res = await svc.set("u1", true);
    expect(update).not.toHaveBeenCalled();
    expect(res).toEqual({ available: true, availableSince: "2026-07-12T08:00:00.000Z" });
  });

  it("desliga o turno quando estava ligado (limpa)", async () => {
    const at = new Date("2026-07-12T08:00:00.000Z");
    const { prisma, update } = makePrisma(at);
    const svc = new DriverAvailabilityService(prisma);
    const res = await svc.set("u1", false);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { driverAvailableAt: null } });
    expect(res).toEqual({ available: false, availableSince: null });
  });

  it("desligar quando já desligado é no-op idempotente (não grava)", async () => {
    const { prisma, update } = makePrisma(null);
    const svc = new DriverAvailabilityService(prisma);
    const res = await svc.set("u1", false);
    expect(update).not.toHaveBeenCalled();
    expect(res).toEqual({ available: false, availableSince: null });
  });
});

describe("assertDriverAvailable", () => {
  it("passa quando o entregador está disponível", async () => {
    const { prisma } = makePrisma(new Date());
    await expect(assertDriverAvailable(prisma, "u1")).resolves.toBeUndefined();
  });

  it("lança DRIVER_UNAVAILABLE quando indisponível", async () => {
    const { prisma } = makePrisma(null);
    await expect(assertDriverAvailable(prisma, "u1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("expõe o code DRIVER_UNAVAILABLE no corpo do erro", async () => {
    const { prisma } = makePrisma(null);
    try {
      await assertDriverAvailable(prisma, "u1");
      throw new Error("deveria ter lançado");
    } catch (err) {
      const body = (err as BadRequestException).getResponse() as { code: string };
      expect(body.code).toBe("DRIVER_UNAVAILABLE");
    }
  });

  it("DriverAvailabilityService.assertAvailable delega à função pura", async () => {
    const { prisma } = makePrisma(null);
    const svc = new DriverAvailabilityService(prisma);
    await expect(svc.assertAvailable("u1")).rejects.toBeInstanceOf(BadRequestException);
  });
});
