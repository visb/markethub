import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, VehicleType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantService } from "./merchant.service";

export interface CreateVehicleInput {
  plate: string;
  type: VehicleType; // motorcycle | car | van
  description?: string | null;
  active?: boolean;
  merchantId?: string;
}

export interface UpdateVehicleInput {
  plate?: string;
  type?: VehicleType;
  description?: string | null;
  active?: boolean;
}

/** Normaliza placa: trim + caixa alta (sem hífen/espaços internos). */
function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/[\s-]/g, "");
}

// Placa Mercosul (ABC1D23) ou antiga (ABC1234) — 7 caracteres alfanuméricos.
const PLATE_RE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

/**
 * Gestão da frota de veículos de entrega pelo app merchant (story 14). O veículo
 * pertence à REDE (merchant), não à loja — a frota é compartilhada entre as lojas.
 * Escopo: owner (RoleName `merchant`) e manager (StoreStaff manager) gerenciam a
 * frota das redes no escopo deles. A `merchantId` é SEMPRE resolvida pelo contexto
 * do usuário — nunca confiamos no id vindo do body (CLAUDE.md).
 */
@Injectable()
export class MerchantVehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
  ) {}

  /** IDs das redes (merchants) no escopo do usuário (via posse de loja = StoreStaff manager). */
  private async scopedMerchantIds(user: { id: string; roles: string[] }): Promise<string[]> {
    const stores = await this.merchant.myStores(user.id);
    return [...new Set(stores.map((s) => s.merchantId))];
  }

  /** Resolve a rede-alvo: a informada (se for do escopo) ou a única do usuário. */
  private async resolveMerchantId(
    user: { id: string; roles: string[] },
    requested?: string,
  ): Promise<string> {
    const ids = await this.scopedMerchantIds(user);
    if (ids.length === 0) {
      throw new ForbiddenException({
        code: "NOT_A_MERCHANT_USER",
        message: "Usuário não gerencia nenhuma rede",
      });
    }
    if (requested) {
      if (!ids.includes(requested)) {
        throw new ForbiddenException({
          code: "MERCHANT_NOT_IN_SCOPE",
          message: "Rede fora do seu escopo",
        });
      }
      return requested;
    }
    if (ids.length === 1) return ids[0];
    throw new BadRequestException({
      code: "MERCHANT_AMBIGUOUS",
      message: "Usuário possui múltiplas redes; informe merchantId",
    });
  }

  private validatePlate(plate: string): string {
    const normalized = normalizePlate(plate);
    if (!PLATE_RE.test(normalized)) {
      throw new BadRequestException({ code: "INVALID_PLATE", message: "Placa inválida" });
    }
    return normalized;
  }

  /** Lista os veículos das redes no escopo do usuário (opcionalmente filtrado por rede). */
  async list(user: { id: string; roles: string[] }, merchantId?: string) {
    let ids = await this.scopedMerchantIds(user);
    if (ids.length === 0) return [];
    if (merchantId) {
      if (!ids.includes(merchantId)) {
        throw new ForbiddenException({
          code: "MERCHANT_NOT_IN_SCOPE",
          message: "Rede fora do seu escopo",
        });
      }
      ids = [merchantId];
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { merchantId: { in: ids } },
      orderBy: { createdAt: "asc" },
    });
    return vehicles.map((v) => this.toDto(v));
  }

  /** Cadastra um veículo na rede do escopo do usuário. */
  async create(user: { id: string; roles: string[] }, input: CreateVehicleInput) {
    const merchantId = await this.resolveMerchantId(user, input.merchantId);
    const plate = this.validatePlate(input.plate);

    const created = await this.prisma.vehicle.create({
      data: {
        merchantId,
        plate,
        type: input.type,
        description: input.description ?? null,
        active: input.active ?? true,
      },
    });
    return this.toDto(created);
  }

  /** Carrega o veículo garantindo que está numa rede do escopo do usuário. */
  private async loadInScope(user: { id: string; roles: string[] }, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      throw new NotFoundException({ code: "VEHICLE_NOT_FOUND", message: "Veículo não encontrado" });
    }
    const ids = await this.scopedMerchantIds(user);
    if (!ids.includes(vehicle.merchantId)) {
      throw new ForbiddenException({
        code: "MERCHANT_NOT_IN_SCOPE",
        message: "Veículo fora do seu escopo",
      });
    }
    return vehicle;
  }

  /** Atualização parcial (placa/tipo/descrição/active — soft toggle). */
  async update(
    user: { id: string; roles: string[] },
    vehicleId: string,
    patch: UpdateVehicleInput,
  ) {
    await this.loadInScope(user, vehicleId);

    const data: Prisma.VehicleUpdateInput = {};
    if (patch.plate !== undefined) data.plate = this.validatePlate(patch.plate);
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.active !== undefined) data.active = patch.active;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }

    const updated = await this.prisma.vehicle.update({ where: { id: vehicleId }, data });
    return this.toDto(updated);
  }

  /**
   * Remoção. Padrão = desativa (`active=false`) para preservar o histórico de
   * entregas. `hard=true` deleta de fato, mas só se NÃO houver entrega associada
   * (senão `VEHICLE_IN_USE`).
   */
  async remove(user: { id: string; roles: string[] }, vehicleId: string, hard: boolean) {
    await this.loadInScope(user, vehicleId);

    if (hard) {
      const inUse = await this.prisma.delivery.count({ where: { vehicleId } });
      if (inUse > 0) {
        throw new BadRequestException({
          code: "VEHICLE_IN_USE",
          message: "Veículo possui entregas associadas; desative em vez de excluir",
        });
      }
      await this.prisma.vehicle.delete({ where: { id: vehicleId } });
      return { id: vehicleId, removed: true };
    }

    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { active: false },
    });
    return { id: updated.id, active: updated.active };
  }

  private toDto(v: {
    id: string;
    merchantId: string;
    plate: string;
    type: VehicleType;
    description: string | null;
    active: boolean;
    createdAt: Date;
  }) {
    return {
      id: v.id,
      merchantId: v.merchantId,
      plate: v.plate,
      type: v.type,
      description: v.description,
      active: v.active,
      createdAt: v.createdAt.toISOString(),
    };
  }
}
