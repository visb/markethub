import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface StoreOfferFilters {
  search?: string;
  categoryId?: string;
  available?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateMerchantInput {
  name: string;
  slug?: string;
  deliveryFeeCents?: number;
  prepFeeCents?: number;
  platformFeeBps?: number;
  active?: boolean;
}

export interface UpdateMerchantInput {
  name?: string;
  slug?: string;
  logoUrl?: string | null;
  deliveryFeeCents?: number;
  prepFeeCents?: number;
  platformFeeBps?: number;
  active?: boolean;
}

export interface CreateStoreInput {
  merchantId: string;
  name: string;
  externalId?: string;
  street?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  active?: boolean;
}

export type UpdateStoreInput = Partial<Omit<CreateStoreInput, "merchantId">>;

const OFFER_LOCKABLE = ["priceCents", "promoPriceCents", "available"] as const;
const STOCK_LOCKABLE = ["quantity", "available"] as const;

/** Normaliza texto em slug (sem acento, kebab-case). */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Navegação administrativa Mercado → Loja → filhos (produtos/ofertas, staff).
 * Diferente de MerchantService (escopado ao manager logado), aqui o admin enxerga
 * e edita qualquer loja sem checagem de StoreStaff. Somente admin (guard no controller).
 */
@Injectable()
export class AdminMerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Mercados ──

  async listMerchants(search?: string) {
    const q = search?.trim();
    const merchants = await this.prisma.merchant.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        active: true,
        deliveryFeeCents: true,
        platformFeeBps: true,
        _count: { select: { stores: true } },
      },
    });
    return merchants.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      logoUrl: m.logoUrl,
      active: m.active,
      deliveryFeeCents: m.deliveryFeeCents,
      platformFeeBps: m.platformFeeBps,
      storeCount: m._count.stores,
    }));
  }

  async merchantDetail(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        active: true,
        deliveryFeeCents: true,
        prepFeeCents: true,
        platformFeeBps: true,
        connectorType: true,
        stores: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            active: true,
            _count: { select: { offers: true, staff: true } },
          },
        },
      },
    });
    if (!merchant) {
      throw new NotFoundException({ code: "MERCHANT_NOT_FOUND", message: "Mercado não encontrado" });
    }
    const { stores, ...rest } = merchant;
    return {
      ...rest,
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        state: s.state,
        active: s.active,
        offerCount: s._count.offers,
        staffCount: s._count.staff,
      })),
    };
  }

  async createMerchant(input: CreateMerchantInput) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException({ code: "INVALID_NAME", message: "Nome obrigatório" });
    const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(name)) || slugify(name);
    const existing = await this.prisma.merchant.findUnique({ where: { slug } });
    if (existing) throw new ConflictException({ code: "SLUG_TAKEN", message: "Slug já existe" });
    return this.prisma.merchant.create({
      data: {
        name,
        slug,
        ...(input.deliveryFeeCents !== undefined ? { deliveryFeeCents: input.deliveryFeeCents } : {}),
        ...(input.prepFeeCents !== undefined ? { prepFeeCents: input.prepFeeCents } : {}),
        ...(input.platformFeeBps !== undefined ? { platformFeeBps: input.platformFeeBps } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async updateMerchant(id: string, patch: UpdateMerchantInput) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) {
      throw new NotFoundException({ code: "MERCHANT_NOT_FOUND", message: "Mercado não encontrado" });
    }
    const data: Prisma.MerchantUpdateInput = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new BadRequestException({ code: "INVALID_NAME", message: "Nome obrigatório" });
      data.name = name;
    }
    if (patch.slug !== undefined) {
      const slug = slugify(patch.slug);
      if (!slug) throw new BadRequestException({ code: "INVALID_SLUG", message: "Slug inválido" });
      const clash = await this.prisma.merchant.findUnique({ where: { slug } });
      if (clash && clash.id !== id) {
        throw new ConflictException({ code: "SLUG_TAKEN", message: "Slug já existe" });
      }
      data.slug = slug;
    }
    if (patch.logoUrl !== undefined) data.logoUrl = patch.logoUrl;
    if (patch.deliveryFeeCents !== undefined) data.deliveryFeeCents = patch.deliveryFeeCents;
    if (patch.prepFeeCents !== undefined) data.prepFeeCents = patch.prepFeeCents;
    if (patch.platformFeeBps !== undefined) data.platformFeeBps = patch.platformFeeBps;
    if (patch.active !== undefined) data.active = patch.active;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }
    return this.prisma.merchant.update({ where: { id }, data });
  }

  // ── Lojas ──

  async storeDetail(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        externalId: true,
        street: true,
        number: true,
        district: true,
        city: true,
        state: true,
        zipCode: true,
        active: true,
        merchant: { select: { id: true, name: true } },
        _count: { select: { offers: true, staff: true, deliverySlots: true } },
      },
    });
    if (!store) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Loja não encontrada" });
    }

    const ordersByStatus = await this.prisma.order.groupBy({
      by: ["status"],
      where: { groups: { some: { storeId: id } } },
      _count: { _all: true },
    });

    const { _count, ...rest } = store;
    return {
      ...rest,
      counts: {
        offers: _count.offers,
        staff: _count.staff,
        slots: _count.deliverySlots,
        ordersByStatus: Object.fromEntries(ordersByStatus.map((o) => [o.status, o._count._all])),
      },
    };
  }

  async setStoreActive(id: string, active: boolean) {
    await this.assertStoreExists(id);
    return this.prisma.store.update({
      where: { id },
      data: { active },
      select: { id: true, active: true },
    });
  }

  async createStore(input: CreateStoreInput) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: input.merchantId } });
    if (!merchant) {
      throw new NotFoundException({ code: "MERCHANT_NOT_FOUND", message: "Mercado não encontrado" });
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException({ code: "INVALID_NAME", message: "Nome obrigatório" });
    return this.prisma.store.create({
      data: {
        merchantId: input.merchantId,
        name,
        externalId: input.externalId ?? null,
        street: input.street ?? null,
        number: input.number ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zipCode: input.zipCode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async updateStore(id: string, patch: UpdateStoreInput) {
    await this.assertStoreExists(id);
    const data: Prisma.StoreUpdateInput = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new BadRequestException({ code: "INVALID_NAME", message: "Nome obrigatório" });
      data.name = name;
    }
    if (patch.externalId !== undefined) data.externalId = patch.externalId || null;
    if (patch.street !== undefined) data.street = patch.street || null;
    if (patch.number !== undefined) data.number = patch.number || null;
    if (patch.district !== undefined) data.district = patch.district || null;
    if (patch.city !== undefined) data.city = patch.city || null;
    if (patch.state !== undefined) data.state = patch.state || null;
    if (patch.zipCode !== undefined) data.zipCode = patch.zipCode || null;
    if (patch.latitude !== undefined) data.latitude = patch.latitude;
    if (patch.longitude !== undefined) data.longitude = patch.longitude;
    if (patch.active !== undefined) data.active = patch.active;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }
    return this.prisma.store.update({ where: { id }, data });
  }

  // ── Ofertas + estoque da loja ──

  async storeOffers(storeId: string, filters: StoreOfferFilters) {
    await this.assertStoreExists(storeId);

    const where: Prisma.OfferWhereInput = {
      storeId,
      ...(filters.available !== undefined ? { available: filters.available } : {}),
      ...(filters.categoryId || filters.search
        ? {
            product: {
              ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
              ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
            },
          }
        : {}),
    };

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const [offers, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        orderBy: { product: { name: "asc" } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: {
            select: { id: true, name: true, brand: true, imageUrl: true, saleType: true, categoryId: true },
          },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);

    const productIds = offers.map((o) => o.productId);
    const stocks = await this.prisma.stock.findMany({
      where: { storeId, productId: { in: productIds } },
      select: { id: true, storeId: true, productId: true, quantity: true, available: true, lockedFields: true },
    });
    const stockKey = (s: { storeId: string; productId: string }) => `${s.storeId}:${s.productId}`;
    const stockMap = new Map(stocks.map((s) => [stockKey(s), s]));

    return {
      items: offers.map((o) => ({
        id: o.id,
        storeId: o.storeId,
        product: o.product,
        priceCents: o.priceCents,
        promoPriceCents: o.promoPriceCents,
        available: o.available,
        lockedFields: o.lockedFields,
        stock: stockMap.get(stockKey({ storeId, productId: o.productId })) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async updateOffer(
    offerId: string,
    patch: { priceCents?: number; promoPriceCents?: number | null; available?: boolean },
    updatedById: string,
  ) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Oferta não encontrada" });

    const data: Prisma.OfferUpdateInput = {};
    const newLocks = new Set(offer.lockedFields);
    if (patch.priceCents !== undefined) {
      if (!Number.isInteger(patch.priceCents) || patch.priceCents < 0) {
        throw new BadRequestException({ code: "INVALID_PRICE", message: "priceCents inválido" });
      }
      data.priceCents = patch.priceCents;
      newLocks.add("priceCents");
    }
    if (patch.promoPriceCents !== undefined) {
      data.promoPriceCents = patch.promoPriceCents;
      newLocks.add("promoPriceCents");
    }
    if (patch.available !== undefined) {
      data.available = patch.available;
      newLocks.add("available");
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }
    data.lockedFields = [...newLocks];
    data.updatedById = updatedById;
    return this.prisma.offer.update({ where: { id: offerId }, data });
  }

  async unlockOffer(offerId: string, field: string, updatedById: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Oferta não encontrada" });
    if (!OFFER_LOCKABLE.includes(field as (typeof OFFER_LOCKABLE)[number])) {
      throw new BadRequestException({ code: "INVALID_FIELD", message: `Campo não travável: ${field}` });
    }
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { lockedFields: offer.lockedFields.filter((f) => f !== field), updatedById },
    });
  }

  async updateStock(
    stockId: string,
    patch: { quantity?: number | null; available?: boolean },
    updatedById: string,
  ) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new NotFoundException({ code: "STOCK_NOT_FOUND", message: "Estoque não encontrado" });

    const data: Prisma.StockUpdateInput = {};
    const newLocks = new Set(stock.lockedFields);
    if (patch.quantity !== undefined) {
      if (patch.quantity !== null && (!Number.isInteger(patch.quantity) || patch.quantity < 0)) {
        throw new BadRequestException({ code: "INVALID_QUANTITY", message: "quantity inválido" });
      }
      data.quantity = patch.quantity;
      newLocks.add("quantity");
    }
    if (patch.available !== undefined) {
      data.available = patch.available;
      newLocks.add("available");
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }
    data.lockedFields = [...newLocks];
    data.updatedById = updatedById;
    return this.prisma.stock.update({ where: { id: stockId }, data });
  }

  async unlockStock(stockId: string, field: string, updatedById: string) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new NotFoundException({ code: "STOCK_NOT_FOUND", message: "Estoque não encontrado" });
    if (!STOCK_LOCKABLE.includes(field as (typeof STOCK_LOCKABLE)[number])) {
      throw new BadRequestException({ code: "INVALID_FIELD", message: `Campo não travável: ${field}` });
    }
    return this.prisma.stock.update({
      where: { id: stockId },
      data: { lockedFields: stock.lockedFields.filter((f) => f !== field), updatedById },
    });
  }

  // ── Funcionários da loja ──

  async storeStaff(storeId: string) {
    await this.assertStoreExists(storeId);
    const staff = await this.prisma.storeStaff.findMany({
      where: { storeId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        staffRole: true,
        active: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, active: true } },
      },
    });
    return staff.map((s) => ({
      id: s.id,
      staffRole: s.staffRole,
      active: s.active,
      createdAt: s.createdAt,
      user: s.user,
    }));
  }

  /** Ativa/desativa o vínculo do funcionário com a loja (não mexe na conta do usuário). */
  async setStaffActive(staffId: string, active: boolean) {
    const staff = await this.prisma.storeStaff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Vínculo não encontrado" });
    return this.prisma.storeStaff.update({
      where: { id: staffId },
      data: { active },
      select: { id: true, active: true },
    });
  }

  /** Remove o vínculo do funcionário com a loja (StoreStaff). A conta do usuário permanece. */
  async removeStaff(staffId: string) {
    const staff = await this.prisma.storeStaff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Vínculo não encontrado" });
    await this.prisma.storeStaff.delete({ where: { id: staffId } });
    return { removed: true };
  }

  private async assertStoreExists(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id }, select: { id: true } });
    if (!store) throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Loja não encontrada" });
  }
}
