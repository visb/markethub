import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DriverVehicleService } from "./driver-vehicle.service";

/**
 * Story 15 — seleção de veículo pelo entregador. O escopo (rede) sai do vínculo de
 * staff (StoreStaff driver), nunca do cliente. Mock do Prisma direcionado por caso.
 */
function makePrisma(opts: {
  staff?: Array<{ store: { merchantId: string } }>;
  vehicles?: Array<{ id: string; plate: string; type: string; description: string | null }>;
  vehicleById?: Record<string, { id: string; merchantId: string; active: boolean; plate: string; type: string; description: string | null } | null>;
  activeVehicle?: { id: string; merchantId: string; active: boolean; plate: string; type: string; description: string | null } | null;
}) {
  const update = jest.fn().mockResolvedValue({});
  return {
    prisma: {
      storeStaff: {
        findMany: jest.fn().mockResolvedValue(opts.staff ?? []),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue(opts.vehicles ?? []),
        findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(opts.vehicleById?.[id] ?? null),
        ),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ activeVehicle: opts.activeVehicle ?? null }),
        update,
      },
    } as never,
    update,
  };
}

const merchantA = "merchA";
const merchantB = "merchB";
const vehA = { id: "vA", merchantId: merchantA, active: true, plate: "ABC1D23", type: "car", description: null };

describe("DriverVehicleService", () => {
  describe("listAvailable", () => {
    it("retorna [] quando o usuário não é entregador de nenhuma loja", async () => {
      const { prisma } = makePrisma({ staff: [] });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.listAvailable("u1")).resolves.toEqual([]);
    });

    it("lista só veículos active da rede do entregador (subconjunto exposto)", async () => {
      const { prisma } = makePrisma({
        staff: [{ store: { merchantId: merchantA } }],
        vehicles: [{ id: "vA", plate: "ABC1D23", type: "car", description: "Gol" }],
      });
      const svc = new DriverVehicleService(prisma);
      const res = await svc.listAvailable("u1");
      // só campos do entregador (sem merchantId/active/createdAt)
      expect(res).toEqual([{ id: "vA", plate: "ABC1D23", type: "car", description: "Gol" }]);
      const call = (prisma as unknown as { vehicle: { findMany: jest.Mock } }).vehicle.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ merchantId: { in: [merchantA] }, active: true });
    });
  });

  describe("current", () => {
    it("retorna null quando nada selecionado", async () => {
      const { prisma } = makePrisma({ staff: [{ store: { merchantId: merchantA } }], activeVehicle: null });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.current("u1")).resolves.toBeNull();
    });

    it("reflete a seleção atual quando ainda no escopo e active", async () => {
      const { prisma } = makePrisma({ staff: [{ store: { merchantId: merchantA } }], activeVehicle: vehA });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.current("u1")).resolves.toEqual({ id: "vA", plate: "ABC1D23", type: "car", description: null });
    });

    it("retorna null se o veículo selecionado foi desativado", async () => {
      const { prisma } = makePrisma({
        staff: [{ store: { merchantId: merchantA } }],
        activeVehicle: { ...vehA, active: false },
      });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.current("u1")).resolves.toBeNull();
    });

    it("retorna null se o veículo saiu do escopo do entregador", async () => {
      const { prisma } = makePrisma({
        staff: [{ store: { merchantId: merchantB } }],
        activeVehicle: vehA, // pertence à merchantA, fora do escopo atual
      });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.current("u1")).resolves.toBeNull();
    });
  });

  describe("select", () => {
    it("persiste e retorna o veículo escolhido", async () => {
      const { prisma, update } = makePrisma({
        staff: [{ store: { merchantId: merchantA } }],
        vehicleById: { vA: vehA },
      });
      const svc = new DriverVehicleService(prisma);
      const res = await svc.select("u1", "vA");
      expect(res).toEqual({ id: "vA", plate: "ABC1D23", type: "car", description: null });
      expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { activeVehicleId: "vA" } });
    });

    it("rejeita veículo inexistente → VEHICLE_NOT_FOUND", async () => {
      const { prisma } = makePrisma({
        staff: [{ store: { merchantId: merchantA } }],
        vehicleById: { vX: null },
      });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.select("u1", "vX")).rejects.toMatchObject({
        response: { code: "VEHICLE_NOT_FOUND" },
      });
      await expect(svc.select("u1", "vX")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejeita veículo de outra rede → VEHICLE_NOT_AVAILABLE", async () => {
      const { prisma, update } = makePrisma({
        staff: [{ store: { merchantId: merchantB } }],
        vehicleById: { vA: vehA }, // merchantA, fora do escopo
      });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.select("u1", "vA")).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.select("u1", "vA")).rejects.toMatchObject({
        response: { code: "VEHICLE_NOT_AVAILABLE" },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("rejeita veículo inativo da própria rede → VEHICLE_NOT_AVAILABLE", async () => {
      const { prisma } = makePrisma({
        staff: [{ store: { merchantId: merchantA } }],
        vehicleById: { vA: { ...vehA, active: false } },
      });
      const svc = new DriverVehicleService(prisma);
      await expect(svc.select("u1", "vA")).rejects.toMatchObject({
        response: { code: "VEHICLE_NOT_AVAILABLE" },
      });
    });
  });
});
