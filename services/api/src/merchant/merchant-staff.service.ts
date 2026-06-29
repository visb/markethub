import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { StaffRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AdminUsersService } from "../users/admin-users.service";
import { MerchantService } from "./merchant.service";

export interface CreateMerchantStaffInput {
  name: string;
  email: string;
  password: string;
  staffRole: StaffRole; // admin | manager | picker | driver
  storeId: string;
}

export interface UpdateMerchantStaffInput {
  active?: boolean;
  staffRole?: StaffRole;
}

/** Nível efetivo do ator na hierarquia de gestão de equipe (story 16). */
type ActorLevel = "owner" | "admin" | "manager";

/**
 * Gestão da equipe das lojas pelo app merchant (story 10 + RBAC story 16). Escopo
 * e hierarquia owner > admin > manager — backend é a fonte da verdade (CLAUDE.md):
 * - owner (RoleName `merchant`): todas as lojas das suas redes; cria/edita/remove
 *   qualquer papel (admin | manager | picker | driver); pode deletar o vínculo.
 * - admin (StoreStaff admin ativo): só as lojas dele; gere manager | picker |
 *   driver, mas NÃO cria/edita outro admin (escalonamento — só o owner faz admin).
 * - manager (StoreStaff manager ativo): só as lojas dele; gere picker/driver, mas
 *   NÃO mexe em admin nem manager. Remoção = desativa (owner pode hard delete).
 *
 * Reusa AdminUsersService.createStaff para a criação do User+role+vínculo (não
 * duplica). Aqui só ficam o escopo de loja e a regra de papel.
 */
@Injectable()
export class MerchantStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
    private readonly adminUsers: AdminUsersService,
  ) {}

  /**
   * IDs das lojas no escopo do usuário. Só o **owner** enxerga toda a rede; admin
   * e manager ficam restritos às lojas dos vínculos (admin NÃO escapa do escopo —
   * story 16). Backend é a fonte da verdade.
   */
  private async scopedStoreIds(user: { id: string; roles: string[] }): Promise<string[]> {
    const level = await this.merchant.resolveLevel(user);
    const mine = await this.merchant.myStores(user.id);
    if (level !== "owner") return mine.map((s) => s.id);

    const merchantIds = [...new Set(mine.map((s) => s.merchantId))];
    if (merchantIds.length === 0) return [];
    const stores = await this.prisma.store.findMany({
      where: { merchantId: { in: merchantIds } },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }

  /** Garante que a loja está no escopo do usuário; devolve o nível efetivo dele. */
  private async assertScope(
    user: { id: string; roles: string[] },
    storeId: string,
  ): Promise<{ level: ActorLevel }> {
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
    return { level: await this.merchant.resolveLevel(user) };
  }

  /**
   * Hierarquia de gestão de papel (story 16): admin só o owner faz; manager o owner
   * e o admin fazem; picker/driver qualquer nível no escopo. Bloqueio de
   * escalonamento ⇒ `ROLE_ESCALATION_FORBIDDEN`.
   */
  private assertCanManageRole(level: ActorLevel, staffRole: StaffRole) {
    switch (staffRole) {
      case "admin":
        if (level !== "owner") {
          throw new ForbiddenException({
            code: "ROLE_ESCALATION_FORBIDDEN",
            message: "Apenas o dono pode gerenciar administradores",
          });
        }
        return;
      case "manager":
        if (level === "manager") {
          throw new ForbiddenException({
            code: "ROLE_ESCALATION_FORBIDDEN",
            message: "Apenas dono ou administrador pode gerenciar gerentes",
          });
        }
        return;
      case "picker":
      case "driver":
        return;
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
    const { level } = await this.assertScope(user, input.storeId);
    this.assertCanManageRole(level, input.staffRole);
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
    const { level } = await this.assertScope(user, staff.storeId);
    return { staff, level };
  }

  /** Ativa/desativa o vínculo ou troca o papel (dentro das regras). */
  async update(
    user: { id: string; roles: string[] },
    staffId: string,
    patch: UpdateMerchantStaffInput,
  ) {
    const { staff, level } = await this.loadInScope(user, staffId);
    // o ator precisa poder gerenciar o papel atual do vínculo (e o novo, se trocar)
    this.assertCanManageRole(level, staff.staffRole);
    if (patch.staffRole !== undefined) this.assertCanManageRole(level, patch.staffRole);

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
    const { staff, level } = await this.loadInScope(user, staffId);
    this.assertCanManageRole(level, staff.staffRole);

    if (hard) {
      if (level !== "owner") {
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
