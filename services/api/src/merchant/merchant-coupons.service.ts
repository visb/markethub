import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Coupon, Merchant, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertValidCouponCode,
  assertValidCouponRules,
  type CouponType,
} from "../shared/coupon-rules";
import { MerchantService } from "./merchant.service";

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  value: number;
  minOrderCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  maxUses?: number | null;
  active?: boolean;
  merchantId?: string;
}

export interface UpdateCouponInput {
  type?: CouponType;
  value?: number;
  minOrderCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  maxUses?: number | null;
  active?: boolean;
}

type CouponRow = Coupon & { merchant: Pick<Merchant, "name"> | null };

/**
 * Gestão de cupons da REDE pelo app merchant (story 53). O cupom pertence ao
 * merchant (rede), não à loja — logo é gestão de nível owner/administrador
 * (capability `coupons.manage`, fora do alcance do gerente de loja). A `merchantId`
 * é SEMPRE resolvida pelo contexto do usuário (nunca confiamos no body — CLAUDE.md);
 * cupons globais (merchantId null) são exclusivos do admin e ficam fora deste escopo.
 */
@Injectable()
export class MerchantCouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
  ) {}

  /** owner/admin podem gerir cupons; gerente de loja (manager) recebe FORBIDDEN. */
  private async assertCanManage(user: { id: string; roles: string[] }): Promise<void> {
    const level = await this.merchant.resolveLevel(user);
    if (level === "manager") {
      throw new ForbiddenException({
        code: "COUPONS_FORBIDDEN",
        message: "Apenas dono ou administrador da rede gerenciam cupons",
      });
    }
  }

  /** IDs das redes no escopo do usuário (via posse de loja = StoreStaff admin/manager). */
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

  /** Garante código único (case-insensitive já normalizado) — senão 409. */
  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException({
        code: "COUPON_CODE_TAKEN",
        message: "Já existe um cupom com este código",
      });
    }
  }

  /** Lista os cupons das redes no escopo do usuário (opcionalmente por rede). */
  async list(user: { id: string; roles: string[] }, merchantId?: string) {
    await this.assertCanManage(user);
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

    const coupons = await this.prisma.coupon.findMany({
      where: { merchantId: { in: ids } },
      include: { merchant: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return coupons.map((c) => this.toDto(c));
  }

  /** Cria um cupom na rede do escopo do usuário (código imutável após isto). */
  async create(user: { id: string; roles: string[] }, input: CreateCouponInput) {
    await this.assertCanManage(user);
    const merchantId = await this.resolveMerchantId(user, input.merchantId);
    const code = assertValidCouponCode(input.code);
    assertValidCouponRules(
      {
        type: input.type,
        value: input.value,
        validFrom: input.validFrom,
        validTo: input.validTo,
        maxUses: input.maxUses,
      },
      0,
    );
    await this.assertCodeAvailable(code);

    const created = await this.prisma.coupon.create({
      data: {
        code,
        type: input.type,
        value: input.value,
        merchantId,
        minOrderCents: input.minOrderCents ?? null,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
        maxUses: input.maxUses ?? null,
        active: input.active ?? true,
      },
      include: { merchant: { select: { name: true } } },
    });
    return this.toDto(created);
  }

  /** Carrega o cupom garantindo que está numa rede do escopo (global → fora). */
  private async loadInScope(user: { id: string; roles: string[] }, couponId: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      include: { merchant: { select: { name: true } } },
    });
    if (!coupon) {
      throw new NotFoundException({ code: "COUPON_NOT_FOUND", message: "Cupom não encontrado" });
    }
    const ids = await this.scopedMerchantIds(user);
    if (!coupon.merchantId || !ids.includes(coupon.merchantId)) {
      throw new ForbiddenException({
        code: "MERCHANT_NOT_IN_SCOPE",
        message: "Cupom fora do seu escopo",
      });
    }
    return coupon;
  }

  /** Atualização parcial. Código é imutável; demais campos editáveis. */
  async update(user: { id: string; roles: string[] }, couponId: string, patch: UpdateCouponInput) {
    await this.assertCanManage(user);
    const current = await this.loadInScope(user, couponId);

    // Valores efetivos (merge do patch sobre o atual) p/ validar as regras.
    assertValidCouponRules(
      {
        type: patch.type ?? current.type,
        value: patch.value ?? current.value,
        validFrom: patch.validFrom !== undefined ? patch.validFrom : current.validFrom,
        validTo: patch.validTo !== undefined ? patch.validTo : current.validTo,
        maxUses: patch.maxUses !== undefined ? patch.maxUses : current.maxUses,
      },
      current.usedCount,
    );

    const data: Prisma.CouponUpdateInput = {};
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.value !== undefined) data.value = patch.value;
    if (patch.minOrderCents !== undefined) data.minOrderCents = patch.minOrderCents;
    if (patch.validFrom !== undefined) {
      data.validFrom = patch.validFrom ? new Date(patch.validFrom) : null;
    }
    if (patch.validTo !== undefined) data.validTo = patch.validTo ? new Date(patch.validTo) : null;
    if (patch.maxUses !== undefined) data.maxUses = patch.maxUses;
    if (patch.active !== undefined) data.active = patch.active;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }

    const updated = await this.prisma.coupon.update({
      where: { id: couponId },
      data,
      include: { merchant: { select: { name: true } } },
    });
    return this.toDto(updated);
  }

  /** Remove o cupom. Com uso (`usedCount > 0`) → 400 COUPON_IN_USE (só desativa). */
  async remove(user: { id: string; roles: string[] }, couponId: string) {
    await this.assertCanManage(user);
    const coupon = await this.loadInScope(user, couponId);

    if (coupon.usedCount > 0) {
      throw new BadRequestException({
        code: "COUPON_IN_USE",
        message: "Cupom já foi utilizado; desative em vez de excluir",
      });
    }
    await this.prisma.coupon.delete({ where: { id: couponId } });
    return { id: couponId, removed: true };
  }

  private toDto(c: CouponRow) {
    return {
      id: c.id,
      code: c.code,
      type: c.type as CouponType,
      value: c.value,
      merchantId: c.merchantId,
      merchantName: c.merchant?.name ?? null,
      minOrderCents: c.minOrderCents,
      validFrom: c.validFrom ? c.validFrom.toISOString() : null,
      validTo: c.validTo ? c.validTo.toISOString() : null,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      active: c.active,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
