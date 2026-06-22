import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { StaffRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AdminUsersService } from "../users/admin-users.service";
import { MerchantService } from "./merchant.service";

export interface CreateMerchantStaffInput {
  name: string;
  email: string;
  password: string;
  staffRole: StaffRole; // manager | picker | driver
  storeId: string;
}

export interface UpdateMerchantStaffInput {
  active?: boolean;
  staffRole?: StaffRole;
}

/**
 * Gestão da equipe das lojas pelo app merchant (story 10). Escopo:
 * - owner (RoleName `merchant`): todas as lojas das suas redes; cria/edita/remove
 *   qualquer papel (manager | picker | driver); pode deletar o vínculo de fato.
 * - manager (StoreStaff manager ativo): só as lojas dele; gere picker/driver, mas
 *   NÃO cria/edita/remove outro manager (evita escalonamento). Remoção = desativa.
 *
 * Reusa AdminUsersService.createStaff para a criação do User+role+vínculo (não
 * duplica). Aqui só ficam o escopo de loja e a regra de papel — sempre reforçados
 * no backend (CLAUDE.md), independente do que o front esconda.
 */
@Injectable()
export class MerchantStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
    private readonly adminUsers: AdminUsersService,
  ) {}

  /** IDs das lojas no escopo do usuário (owner: todas das redes; manager: as dele). */
  private async scopedStoreIds(user: { id: string; roles: string[] }): Promise<string[]> {
    const isOwner = user.roles.includes("merchant");
    const mine = await this.merchant.myStores(user.id);
    if (!isOwner) return mine.map((s) => s.id);

    const merchantIds = [...new Set(mine.map((s) => s.merchantId))];
    if (merchantIds.length === 0) return [];
    const stores = await this.prisma.store.findMany({
      where: { merchantId: { in: merchantIds } },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }

  /** Garante que a loja está no escopo do usuário; devolve se ele é owner. */
  private async assertScope(
    user: { id: string; roles: string[] },
    storeId: string,
  ): Promise<{ isOwner: boolean }> {
    const ids = await this.scopedStoreIds(user);
    if (ids.length === 0) {
      throw new ForbiddenException({
        code: "NOT_A_MERCHANT_USER",
        message: "Usuário não gerencia nenhuma loja",
      });
    }
    if (!ids.includes(storeId)) {
      throw new ForbiddenException({
        code: "STORE_NOT_IN_SCOPE",
        message: "Loja fora do seu escopo",
      });
    }
    return { isOwner: user.roles.includes("merchant") };
  }

  /** Só o owner pode mexer em (ou criar) papel manager — gerente não escala outro. */
  private assertCanManageRole(isOwner: boolean, staffRole: StaffRole) {
    if (staffRole === "manager" && !isOwner) {
      throw new ForbiddenException({
        code: "CANNOT_MANAGE_MANAGER",
        message: "Apenas o dono pode gerenciar gerentes",
      });
    }
  }

  /** Lista colaboradores das lojas no escopo (opcionalmente filtrado por loja). */
  async list(user: { id: string; roles: string[] }, storeId?: string) {
    let ids = await this.scopedStoreIds(user);
    if (storeId) {
      if (!ids.includes(storeId)) {
        throw new ForbiddenException({
          code: "STORE_NOT_IN_SCOPE",
          message: "Loja fora do seu escopo",
        });
      }
      ids = [storeId];
    }
    if (ids.length === 0) return [];

    const staff = await this.prisma.storeStaff.findMany({
      where: { storeId: { in: ids } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        staffRole: true,
        active: true,
        createdAt: true,
        store: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true, active: true } },
      },
    });
    return staff.map((s) => ({
      id: s.id,
      staffRole: s.staffRole,
      active: s.active,
      createdAt: s.createdAt,
      store: s.store,
      user: s.user,
    }));
  }

  /** Cria colaborador: valida escopo + regra de papel, delega a criação do User. */
  async create(user: { id: string; roles: string[] }, input: CreateMerchantStaffInput) {
    const { isOwner } = await this.assertScope(user, input.storeId);
    this.assertCanManageRole(isOwner, input.staffRole);
    return this.adminUsers.createStaff({
      name: input.name,
      email: input.email,
      password: input.password,
      staffRole: input.staffRole,
      storeId: input.storeId,
    });
  }

  /** Carrega o vínculo garantindo que está no escopo do usuário. */
  private async loadInScope(user: { id: string; roles: string[] }, staffId: string) {
    const staff = await this.prisma.storeStaff.findUnique({
      where: { id: staffId },
      select: { id: true, staffRole: true, active: true, storeId: true },
    });
    if (!staff) {
      throw new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Vínculo não encontrado" });
    }
    const { isOwner } = await this.assertScope(user, staff.storeId);
    return { staff, isOwner };
  }

  /** Ativa/desativa o vínculo ou troca o papel (dentro das regras). */
  async update(
    user: { id: string; roles: string[] },
    staffId: string,
    patch: UpdateMerchantStaffInput,
  ) {
    const { staff, isOwner } = await this.loadInScope(user, staffId);
    // gerente não mexe em vínculo de manager (nem para desativar/rebaixar)
    this.assertCanManageRole(isOwner, staff.staffRole);
    if (patch.staffRole !== undefined) this.assertCanManageRole(isOwner, patch.staffRole);

    const data: { active?: boolean; staffRole?: StaffRole } = {};
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.staffRole !== undefined) data.staffRole = patch.staffRole;

    return this.prisma.storeStaff.update({
      where: { id: staffId },
      data,
      select: { id: true, staffRole: true, active: true },
    });
  }

  /**
   * Remoção. Padrão = desativa (`active=false`) — preserva o User (histórico de
   * pedidos/picking). O owner pode deletar o vínculo de fato (`hard=true`).
   */
  async remove(user: { id: string; roles: string[] }, staffId: string, hard: boolean) {
    const { staff, isOwner } = await this.loadInScope(user, staffId);
    this.assertCanManageRole(isOwner, staff.staffRole);

    if (hard) {
      if (!isOwner) {
        throw new ForbiddenException({
          code: "DELETE_OWNER_ONLY",
          message: "Apenas o dono pode excluir o vínculo",
        });
      }
      await this.prisma.storeStaff.delete({ where: { id: staffId } });
      return { id: staffId, removed: true };
    }

    return this.prisma.storeStaff.update({
      where: { id: staffId },
      data: { active: false },
      select: { id: true, active: true },
    });
  }
}
