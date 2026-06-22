import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { VehicleType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Veículo exposto ao app do entregador (subconjunto do Vehicle da rede). */
export interface DriverVehicleView {
  id: string;
  plate: string;
  type: VehicleType;
  description: string | null;
}

/**
 * Seleção de veículo pelo entregador (story 15). O entregador (StoreStaff role
 * driver) escolhe entre os veículos `active` da REDE (merchant) dona da(s) loja(s)
 * dele e a escolha é persistida em `User.activeVehicleId` — habilita rastreio/
 * relatório por veículo. O escopo (rede) é SEMPRE resolvido pelo vínculo de staff
 * no backend, nunca por id vindo do cliente (CLAUDE.md).
 */
@Injectable()
export class DriverVehicleService {
  constructor(private readonly prisma: PrismaService) {}

  /** IDs das redes (merchants) das lojas em que o usuário é entregador ativo. */
  private async scopedMerchantIds(userId: string): Promise<string[]> {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "driver", active: true },
      select: { store: { select: { merchantId: true } } },
    });
    return [...new Set(staff.map((s) => s.store.merchantId))];
  }

  /** Veículos `active` da(s) rede(s) do entregador, ordenados por criação. */
  async listAvailable(userId: string): Promise<DriverVehicleView[]> {
    const merchantIds = await this.scopedMerchantIds(userId);
    if (merchantIds.length === 0) return [];
    const vehicles = await this.prisma.vehicle.findMany({
      where: { merchantId: { in: merchantIds }, active: true },
      orderBy: { createdAt: "asc" },
    });
    return vehicles.map((v) => this.toView(v));
  }

  /** Veículo atualmente selecionado pelo entregador (ou null). */
  async current(userId: string): Promise<DriverVehicleView | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeVehicle: true },
    });
    const vehicle = user?.activeVehicle;
    // Se o veículo foi desativado/removido da rede, não considera mais como atual.
    if (!vehicle || !vehicle.active) return null;
    // Garante que o veículo ainda pertence à rede do entregador (escopo pode mudar).
    const merchantIds = await this.scopedMerchantIds(userId);
    if (!merchantIds.includes(vehicle.merchantId)) return null;
    return this.toView(vehicle);
  }

  /**
   * Seleciona/troca o veículo do turno. Valida que o veículo existe, está `active`
   * e pertence a uma rede do escopo do entregador; senão erro `{ code, message }`.
   */
  async select(userId: string, vehicleId: string): Promise<DriverVehicleView> {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Veículo não encontrado" });
    }
    const merchantIds = await this.scopedMerchantIds(userId);
    if (!merchantIds.includes(vehicle.merchantId) || !vehicle.active) {
      throw new ForbiddenException({
        code: "VEHICLE_NOT_AVAILABLE",
        message: "Veículo indisponível para o entregador",
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeVehicleId: vehicleId },
    });
    return this.toView(vehicle);
  }

  private toView(v: {
    id: string;
    plate: string;
    type: VehicleType;
    description: string | null;
  }): DriverVehicleView {
    return { id: v.id, plate: v.plate, type: v.type, description: v.description };
  }
}
