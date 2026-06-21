import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface OfferFilters {
  storeId?: string;
  categoryId?: string;
  search?: string;
  available?: boolean;
}

const OFFER_LOCKABLE = ["priceCents", "promoPriceCents", "available"] as const;
const STOCK_LOCKABLE = ["quantity", "available"] as const;

/**
 * Gestão de ofertas e estoque pelo manager do merchant (S3.9). Tudo escopado às
 * lojas onde o usuário é StoreStaff(manager). Campos editados manualmente entram
 * em lockedFields e passam a ser ignorados pelo sync ERP (S1.4).
 */
@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Contexto de identidade do app merchant (story 07). Resolve o papel efetivo:
   * - owner: usuário com RoleName `merchant` → vê todas as lojas das redes que
   *   possui (vínculo manager nessas redes; MVP usa StoreStaff como posse).
   * - manager: sem RoleName `merchant`, mas com StoreStaff(manager) ativo → vê
   *   só as lojas dos vínculos dele.
   * Nega (FORBIDDEN) quem não é nenhum dos dois.
   */
  async getContext(user: {
    id: string;
    roles: string[];
  }): Promise<{ role: "owner" | "manager"; merchantId: string | null; stores: { id: string; name: string; merchantId: string }[] }> {
    const stores = await this.myStores(user.id);
    const isOwner = user.roles.includes("merchant");

    if (!isOwner && stores.length === 0) {
      throw new ForbiddenException({
        code: "NOT_A_MERCHANT_USER",
        message: "Usuário não é dono nem gerente de nenhuma loja",
      });
    }

    return {
      role: isOwner ? "owner" : "manager",
      merchantId: stores[0]?.merchantId ?? null,
      stores,
    };
  }

  /** IDs das lojas onde o usuário é manager ativo. */
  async managerStoreIds(userId: string): Promise<string[]> {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "manager", active: true },
      select: { storeId: true },
    });
    return staff.map((s) => s.storeId);
  }

  /** Lojas geridas pelo manager (para o seletor de loja). */
  async myStores(userId: string) {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "manager", active: true },
      include: { store: { select: { id: true, name: true, merchantId: true } } },
    });
    return staff.map((s) => s.store);
  }

  // ── Ofertas ──

  async listOffers(userId: string, filters: OfferFilters) {
    const storeIds = await this.requireStores(userId, filters.storeId);

    const where: Prisma.OfferWhereInput = {
      storeId: { in: storeIds },
      ...(filters.available !== undefined ? { available: filters.available } : {}),
      ...(filters.categoryId || filters.search
        ? {
            product: {
              ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
              ...(filters.search
                ? { name: { contains: filters.search, mode: "insensitive" } }
                : {}),
            },
          }
        : {}),
    };

    const offers = await this.prisma.offer.findMany({
      where,
      orderBy: { product: { name: "asc" } },
      include: {
        product: { select: { id: true, name: true, brand: true, imageUrl: true, saleType: true, categoryId: true } },
        store: { select: { id: true, name: true } },
      },
    });

    // anexa estoque (por store+product) para a visão do manager
    const stocks = await this.prisma.stock.findMany({
      where: { storeId: { in: storeIds } },
      select: { storeId: true, productId: true, quantity: true, available: true, lockedFields: true },
    });
    const stockKey = (s: { storeId: string; productId: string }) => `${s.storeId}:${s.productId}`;
    const stockMap = new Map(stocks.map((s) => [stockKey(s), s]));

    return offers.map((o) => ({
      id: o.id,
      storeId: o.storeId,
      storeName: o.store.name,
      product: o.product,
      priceCents: o.priceCents,
      promoPriceCents: o.promoPriceCents,
      available: o.available,
      lockedFields: o.lockedFields,
      stock: stockMap.get(stockKey(o)) ?? null,
    }));
  }

  async updateOffer(
    userId: string,
    offerId: string,
    patch: { priceCents?: number; promoPriceCents?: number | null; available?: boolean },
  ) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Oferta não encontrada" });
    await this.assertStore(userId, offer.storeId);

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
    data.updatedById = userId;

    return this.prisma.offer.update({ where: { id: offerId }, data });
  }

  /** Destrava um campo da oferta — devolve o controle ao sync ERP. */
  async unlockOffer(userId: string, offerId: string, field: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Oferta não encontrada" });
    await this.assertStore(userId, offer.storeId);
    if (!OFFER_LOCKABLE.includes(field as (typeof OFFER_LOCKABLE)[number])) {
      throw new BadRequestException({ code: "INVALID_FIELD", message: `Campo não travável: ${field}` });
    }
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { lockedFields: offer.lockedFields.filter((f) => f !== field), updatedById: userId },
    });
  }

  // ── Estoque ──

  async listStocks(userId: string, storeId?: string) {
    const storeIds = await this.requireStores(userId, storeId);
    const stocks = await this.prisma.stock.findMany({
      where: { storeId: { in: storeIds } },
      include: {
        product: { select: { id: true, name: true, brand: true, saleType: true } },
        store: { select: { id: true, name: true } },
      },
      orderBy: { product: { name: "asc" } },
    });
    return stocks.map((s) => ({
      id: s.id,
      storeId: s.storeId,
      storeName: s.store.name,
      product: s.product,
      quantity: s.quantity,
      available: s.available,
      lockedFields: s.lockedFields,
    }));
  }

  async updateStock(
    userId: string,
    stockId: string,
    patch: { quantity?: number | null; available?: boolean },
  ) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new NotFoundException({ code: "STOCK_NOT_FOUND", message: "Estoque não encontrado" });
    await this.assertStore(userId, stock.storeId);

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
    data.updatedById = userId;

    return this.prisma.stock.update({ where: { id: stockId }, data });
  }

  async unlockStock(userId: string, stockId: string, field: string) {
    const stock = await this.prisma.stock.findUnique({ where: { id: stockId } });
    if (!stock) throw new NotFoundException({ code: "STOCK_NOT_FOUND", message: "Estoque não encontrado" });
    await this.assertStore(userId, stock.storeId);
    if (!STOCK_LOCKABLE.includes(field as (typeof STOCK_LOCKABLE)[number])) {
      throw new BadRequestException({ code: "INVALID_FIELD", message: `Campo não travável: ${field}` });
    }
    return this.prisma.stock.update({
      where: { id: stockId },
      data: { lockedFields: stock.lockedFields.filter((f) => f !== field), updatedById: userId },
    });
  }

  // ── escopo ──

  /** Resolve as lojas-alvo: se storeId vier, valida posse; senão, todas do manager. */
  private async requireStores(userId: string, storeId?: string): Promise<string[]> {
    const all = await this.managerStoreIds(userId);
    if (all.length === 0) {
      throw new ForbiddenException({ code: "NOT_A_MANAGER", message: "Usuário não gerencia nenhuma loja" });
    }
    if (storeId) {
      if (!all.includes(storeId)) {
        throw new ForbiddenException({ code: "STORE_NOT_MANAGED", message: "Loja não gerida por você" });
      }
      return [storeId];
    }
    return all;
  }

  private async assertStore(userId: string, storeId: string) {
    const all = await this.managerStoreIds(userId);
    if (!all.includes(storeId)) {
      throw new ForbiddenException({ code: "STORE_NOT_MANAGED", message: "Loja não gerida por você" });
    }
  }
}
