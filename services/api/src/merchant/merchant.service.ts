import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../geocoding/geocoding-provider.interface";
import { PrismaService } from "../prisma/prisma.service";

export interface OfferFilters {
  storeId?: string;
  categoryId?: string;
  search?: string;
  available?: boolean;
}

/** Endereço estruturado da loja (campos opcionais; compõem o geocode). */
export interface StoreAddressInput {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface CreateStoreInput extends StoreAddressInput {
  name: string;
  merchantId?: string;
  externalId?: string | null;
  avgPrepMinutes?: number;
  active?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdateStoreInput extends StoreAddressInput {
  name?: string;
  externalId?: string | null;
  avgPrepMinutes?: number;
  active?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

const ADDRESS_FIELDS = ["street", "number", "district", "city", "state", "zipCode"] as const;

const OFFER_LOCKABLE = ["priceCents", "promoPriceCents", "available"] as const;
const STOCK_LOCKABLE = ["quantity", "available"] as const;

/**
 * Gestão de ofertas e estoque pelo manager do merchant (S3.9). Tudo escopado às
 * lojas onde o usuário é StoreStaff(manager). Campos editados manualmente entram
 * em lockedFields e passam a ser ignorados pelo sync ERP (S1.4).
 */
@Injectable()
export class MerchantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
  ) {}

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

  // ── Lojas (CRUD — story 08) ──

  /**
   * Lista detalhada das lojas visíveis ao usuário (story 08). Owner vê todas as
   * lojas das suas redes; manager vê só as dos vínculos. Inclui endereço/coords.
   */
  async listStores(user: { id: string; roles: string[] }) {
    const scoped = await this.myStores(user.id);
    if (scoped.length === 0) return [];

    const isOwner = user.roles.includes("merchant");
    const where: Prisma.StoreWhereInput = isOwner
      ? { merchantId: { in: [...new Set(scoped.map((s) => s.merchantId))] } }
      : { id: { in: scoped.map((s) => s.id) } };

    return this.prisma.store.findMany({ where, orderBy: { name: "asc" } });
  }

  /**
   * Garante que o usuário é dono da rede (RoleName `merchant`). Criar/editar loja
   * é owner-only; gerente recebe FORBIDDEN. O backend SEMPRE reforça (CLAUDE.md).
   */
  private assertOwner(user: { roles: string[] }) {
    if (!user.roles.includes("merchant")) {
      throw new ForbiddenException({
        code: "NOT_AN_OWNER",
        message: "Apenas o dono da rede pode gerenciar lojas",
      });
    }
  }

  /** Resolve o merchantId do dono: o informado (se for dele) ou o único da rede. */
  private async resolveOwnerMerchantId(userId: string, requested?: string): Promise<string> {
    const stores = await this.myStores(userId);
    const owned = new Set(stores.map((s) => s.merchantId));
    if (requested) {
      if (owned.size > 0 && !owned.has(requested)) {
        throw new ForbiddenException({
          code: "MERCHANT_NOT_OWNED",
          message: "Rede não pertence ao usuário",
        });
      }
      return requested;
    }
    if (owned.size === 1) return [...owned][0];
    if (owned.size === 0) {
      throw new BadRequestException({
        code: "MERCHANT_NOT_RESOLVED",
        message: "Não foi possível determinar a rede; informe merchantId",
      });
    }
    throw new BadRequestException({
      code: "MERCHANT_AMBIGUOUS",
      message: "Usuário possui múltiplas redes; informe merchantId",
    });
  }

  /** Best-effort geocode do endereço → lat/lng; null quando não resolve (não trava). */
  private async geocodeAddress(addr: StoreAddressInput): Promise<{ latitude: number; longitude: number } | null> {
    if (!addr.street || !addr.city || !addr.state) return null;
    try {
      return await this.geocoding.geocode({
        street: addr.street,
        number: addr.number ?? null,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zipCode ?? null,
      });
    } catch {
      return null;
    }
  }

  async createStore(user: { id: string; roles: string[] }, input: CreateStoreInput) {
    this.assertOwner(user);
    const merchantId = await this.resolveOwnerMerchantId(user.id, input.merchantId);

    // Override manual de lat/lng tem prioridade; senão geocodifica o endereço.
    let { latitude, longitude } = input;
    if (latitude == null || longitude == null) {
      const geo = await this.geocodeAddress(input);
      if (geo) {
        latitude = geo.latitude;
        longitude = geo.longitude;
      }
    }

    return this.prisma.store.create({
      data: {
        merchantId,
        name: input.name,
        externalId: input.externalId ?? null,
        street: input.street ?? null,
        number: input.number ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        zipCode: input.zipCode ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        avgPrepMinutes: input.avgPrepMinutes ?? 15,
        active: input.active ?? true,
      },
    });
  }

  async updateStore(user: { id: string; roles: string[] }, storeId: string, patch: UpdateStoreInput) {
    this.assertOwner(user);
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Loja não encontrada" });
    }
    await this.assertOwnsStore(user.id, store.merchantId);

    const data: Prisma.StoreUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.externalId !== undefined) data.externalId = patch.externalId;
    if (patch.avgPrepMinutes !== undefined) data.avgPrepMinutes = patch.avgPrepMinutes;
    if (patch.active !== undefined) data.active = patch.active;
    for (const f of ADDRESS_FIELDS) {
      if (patch[f] !== undefined) data[f] = patch[f];
    }

    // Override manual de lat/lng tem prioridade.
    if (patch.latitude !== undefined) data.latitude = patch.latitude;
    if (patch.longitude !== undefined) data.longitude = patch.longitude;

    // Endereço mudou e sem override manual → re-geocodifica (best-effort).
    const addressChanged = ADDRESS_FIELDS.some((f) => patch[f] !== undefined);
    if (addressChanged && patch.latitude === undefined && patch.longitude === undefined) {
      const merged: StoreAddressInput = {
        street: patch.street !== undefined ? patch.street : store.street,
        number: patch.number !== undefined ? patch.number : store.number,
        district: patch.district !== undefined ? patch.district : store.district,
        city: patch.city !== undefined ? patch.city : store.city,
        state: patch.state !== undefined ? patch.state : store.state,
        zipCode: patch.zipCode !== undefined ? patch.zipCode : store.zipCode,
      };
      const geo = await this.geocodeAddress(merged);
      if (geo) {
        data.latitude = geo.latitude;
        data.longitude = geo.longitude;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: "NO_FIELDS", message: "Nenhum campo para atualizar" });
    }

    return this.prisma.store.update({ where: { id: storeId }, data });
  }

  /** Garante que a rede da loja pertence ao dono. */
  private async assertOwnsStore(userId: string, merchantId: string) {
    const stores = await this.myStores(userId);
    const owned = new Set(stores.map((s) => s.merchantId));
    if (owned.size > 0 && !owned.has(merchantId)) {
      throw new ForbiddenException({
        code: "STORE_NOT_OWNED",
        message: "Loja não pertence à rede do usuário",
      });
    }
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
