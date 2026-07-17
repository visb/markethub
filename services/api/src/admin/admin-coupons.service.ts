import {
  BadRequestException,
  ConflictException,
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

export interface AdminCreateCouponInput {
  code: string;
  title: string;
  description?: string | null;
  type: CouponType;
  value: number;
  minOrderCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  maxUses?: number | null;
  active?: boolean;
  /** null/omitido = cupom global; id = cupom da rede informada. */
  merchantId?: string | null;
}

export interface AdminUpdateCouponInput {
  title?: string;
  description?: string | null;
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
 * Gestão de cupons pelo admin (story 53). O admin enxerga TODOS os cupons (globais
 * + por rede, filtro opcional) e cria cupons globais (merchantId null) ou atrelados
 * a uma rede. Rotas protegidas por `@Roles("admin")` no controller. O código é
 * imutável após a criação; cupom com uso não deleta (400 COUPON_IN_USE) — desativa.
 */
@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException({
        code: "COUPON_CODE_TAKEN",
        message: "Já existe um cupom com este código",
      });
    }
  }

  /**
   * Lista os cupons. `filter`: undefined = todos; "global" = só globais
   * (merchantId null); um id = os daquela rede.
   */
  async list(filter?: string) {
    let where: Prisma.CouponWhereInput | undefined;
    if (filter === "global") where = { merchantId: null };
    else if (filter) where = { merchantId: filter };

    const coupons = await this.prisma.coupon.findMany({
      where,
      include: { merchant: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return coupons.map((c) => this.toDto(c));
  }

  async create(input: AdminCreateCouponInput) {
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

    // merchantId informado precisa existir (senão o cupom fica órfão).
    if (input.merchantId) {
      const merchant = await this.prisma.merchant.findUnique({ where: { id: input.merchantId } });
      if (!merchant) {
        throw new NotFoundException({ code: "MERCHANT_NOT_FOUND", message: "Rede não encontrada" });
      }
    }

    const created = await this.prisma.coupon.create({
      data: {
        code,
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        value: input.value,
        merchantId: input.merchantId ?? null,
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

  private async load(couponId: string): Promise<CouponRow> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      include: { merchant: { select: { name: true } } },
    });
    if (!coupon) {
      throw new NotFoundException({ code: "COUPON_NOT_FOUND", message: "Cupom não encontrado" });
    }
    return coupon;
  }

  async update(couponId: string, patch: AdminUpdateCouponInput) {
    const current = await this.load(couponId);

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
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
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
  async remove(couponId: string) {
    const coupon = await this.load(couponId);
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
      title: c.title,
      description: c.description,
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
