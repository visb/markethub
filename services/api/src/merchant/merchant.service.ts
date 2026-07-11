import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { GEOCODING_PROVIDER, type GeocodingProvider } from "../geocoding";
import { OrdersService } from "../marketplace";
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
    private readonly orders: OrdersService,
  ) {}

  /**
   * Contexto de identidade do app merchant. Resolve o **nível efetivo** do usuário
   * na hierarquia owner > admin > manager (story 16):
   * - owner: usuário com RoleName `merchant` → vê todas as lojas das redes que
   *   possui (vínculo de loja nessas redes; MVP usa StoreStaff como posse).
   * - admin: sem RoleName `merchant`, mas com StoreStaff(admin) ativo → administra
   *   só as lojas dos vínculos dele (acesso total à loja, inclui integração).
   * - manager: sem RoleName `merchant`, com StoreStaff(manager) ativo → gere só as
   *   lojas dos vínculos dele.
   * Nega (FORBIDDEN) quem não é nenhum dos três.
   */
  async getContext(user: {
    id: string;
    roles: string[];
  }): Promise<{ role: "owner" | "admin" | "manager"; merchantId: string | null; stores: { id: string; name: string; merchantId: string }[] }> {
    const stores = await this.myStores(user.id);
    const role = await this.resolveLevel(user);

    if (stores.length === 0 && role !== "owner") {
      throw new ForbiddenException({
        code: "NOT_A_MERCHANT_USER",
        message: "Usuário não é dono, administrador nem gerente de nenhuma loja",
      });
    }

    return {
      role,
      merchantId: stores[0]?.merchantId ?? null,
      stores,
    };
  }

  /**
   * Nível efetivo do usuário na hierarquia owner > admin > manager (story 16).
   * Um vínculo StoreStaff(admin) ativo o torna **admin da loja** (mesmo tendo
   * RoleName `merchant` p/ passar nos guards de controller); só o dono da rede
   * SEM vínculo admin é `owner`. Sem RoleName `merchant` e sem admin → `manager`.
   * O gate de escopo bloqueia quem não tem loja nenhuma.
   */
  async resolveLevel(user: { id: string; roles: string[] }): Promise<"owner" | "admin" | "manager"> {
    const adminLink = await this.prisma.storeStaff.findFirst({
      where: { userId: user.id, staffRole: "admin", active: true },
      select: { id: true },
    });
    if (adminLink) return "admin";
    if (user.roles.includes("merchant")) return "owner";
    return "manager";
  }

  /** IDs das lojas onde o usuário é manager ativo (gestão de oferta/estoque). */
  async managerStoreIds(userId: string): Promise<string[]> {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: { in: ["admin", "manager"] }, active: true },
      select: { storeId: true },
    });
    return staff.map((s) => s.storeId);
  }

  /** Lojas no escopo do usuário (admin/manager ativo) — p/ seletor de loja. */
  async myStores(userId: string) {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: { in: ["admin", "manager"] }, active: true },
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

    // Só o owner lista toda a rede; admin/manager listam as lojas do vínculo (story 16).
    const isOwner = (await this.resolveLevel(user)) === "owner";
    const where: Prisma.StoreWhereInput = isOwner
      ? { merchantId: { in: [...new Set(scoped.map((s) => s.merchantId))] } }
      : { id: { in: scoped.map((s) => s.id) } };

    return this.prisma.store.findMany({ where, orderBy: { name: "asc" } });
  }

  /**
   * Garante que o usuário é dono da rede (nível owner). Criar/editar loja é
   * owner-only (nível de rede); admin e gerente recebem FORBIDDEN. O backend
   * SEMPRE reforça (CLAUDE.md) — admin tem RoleName `merchant`, mas não é owner.
   */
  private async assertOwner(user: { id: string; roles: string[] }) {
    if ((await this.resolveLevel(user)) !== "owner") {
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
    await this.assertOwner(user);
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
    await this.assertOwner(user);
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

  // ── Horário de funcionamento + fechamentos (story 52) ──
  // Mesma capability da edição de loja: owner-only (nível de rede). O backend
  // reforça sempre (assertOwner + posse da rede da loja).

  /**
   * Resolve a loja garantindo que o usuário é dono da rede dela (owner-only,
   * igual a editar a loja). Lança FORBIDDEN/NOT_FOUND conforme o caso.
   */
  private async assertOwnerOfStore(user: { id: string; roles: string[] }, storeId: string) {
    await this.assertOwner(user);
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Loja não encontrada" });
    }
    await this.assertOwnsStore(user.id, store.merchantId);
    return store;
  }

  /** Horário semanal da loja (uma faixa por dia), ordenado por dia da semana. */
  async storeHours(user: { id: string; roles: string[] }, storeId: string) {
    await this.assertOwnerOfStore(user, storeId);
    return this.prisma.storeHours.findMany({
      where: { storeId },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, dayOfWeek: true, opensAt: true, closesAt: true },
    });
  }

  /**
   * Substitui o horário semanal inteiro (replace-all): valida cada faixa
   * (dia 0–6, `opensAt < closesAt`, sem dia duplicado) e troca todas as linhas
   * numa transação. Janelas que cruzam a meia-noite ficam fora de escopo.
   */
  async setStoreHours(
    user: { id: string; roles: string[] },
    storeId: string,
    entries: { dayOfWeek: number; opensAt: number; closesAt: number }[],
  ) {
    await this.assertOwnerOfStore(user, storeId);
    const seen = new Set<number>();
    for (const e of entries) {
      if (!Number.isInteger(e.dayOfWeek) || e.dayOfWeek < 0 || e.dayOfWeek > 6) {
        throw new BadRequestException({
          code: "INVALID_DAY",
          message: `Dia da semana inválido: ${e.dayOfWeek}`,
        });
      }
      if (
        !Number.isInteger(e.opensAt) ||
        !Number.isInteger(e.closesAt) ||
        e.opensAt < 0 ||
        e.closesAt > 1440 ||
        e.closesAt <= e.opensAt
      ) {
        throw new BadRequestException({
          code: "INVALID_HOURS",
          message: "Horário inválido: fechamento deve ser após a abertura",
        });
      }
      if (seen.has(e.dayOfWeek)) {
        throw new BadRequestException({
          code: "DUPLICATE_DAY",
          message: `Dia da semana repetido: ${e.dayOfWeek}`,
        });
      }
      seen.add(e.dayOfWeek);
    }
    await this.prisma.$transaction([
      this.prisma.storeHours.deleteMany({ where: { storeId } }),
      ...(entries.length > 0
        ? [
            this.prisma.storeHours.createMany({
              data: entries.map((e) => ({
                storeId,
                dayOfWeek: e.dayOfWeek,
                opensAt: e.opensAt,
                closesAt: e.closesAt,
              })),
            }),
          ]
        : []),
    ]);
    return this.prisma.storeHours.findMany({
      where: { storeId },
      orderBy: { dayOfWeek: "asc" },
      select: { id: true, dayOfWeek: true, opensAt: true, closesAt: true },
    });
  }

  /** Fechamentos excepcionais da loja (futuros primeiro), ordenados por data. */
  async storeClosures(user: { id: string; roles: string[] }, storeId: string) {
    await this.assertOwnerOfStore(user, storeId);
    const rows = await this.prisma.storeClosure.findMany({
      where: { storeId },
      orderBy: { date: "asc" },
      select: { id: true, date: true, reason: true },
    });
    return rows.map((c) => ({ id: c.id, date: c.date.toISOString().slice(0, 10), reason: c.reason }));
  }

  /**
   * Adiciona um fechamento excepcional (data YYYY-MM-DD + motivo opcional). Data
   * inválida → INVALID_DATE; duplicata do mesmo dia → CLOSURE_EXISTS.
   */
  async addStoreClosure(
    user: { id: string; roles: string[] },
    storeId: string,
    input: { date: string; reason?: string | null },
  ) {
    await this.assertOwnerOfStore(user, storeId);
    const date = parseClosureDate(input.date);
    const existing = await this.prisma.storeClosure.findUnique({
      where: { storeId_date: { storeId, date } },
    });
    if (existing) {
      throw new BadRequestException({ code: "CLOSURE_EXISTS", message: "Já existe fechamento nessa data" });
    }
    const created = await this.prisma.storeClosure.create({
      data: { storeId, date, reason: input.reason?.trim() || null },
      select: { id: true, date: true, reason: true },
    });
    return { id: created.id, date: created.date.toISOString().slice(0, 10), reason: created.reason };
  }

  /** Remove um fechamento excepcional da loja (valida posse da loja). */
  async removeStoreClosure(
    user: { id: string; roles: string[] },
    storeId: string,
    closureId: string,
  ) {
    await this.assertOwnerOfStore(user, storeId);
    const closure = await this.prisma.storeClosure.findUnique({ where: { id: closureId } });
    if (!closure || closure.storeId !== storeId) {
      throw new NotFoundException({ code: "CLOSURE_NOT_FOUND", message: "Fechamento não encontrado" });
    }
    await this.prisma.storeClosure.delete({ where: { id: closureId } });
    return { removed: true };
  }

  // ── Pedidos (story 12) ──

  /**
   * Lojas no escopo do usuário (owner: todas as lojas das redes que possui;
   * manager: só as dos vínculos). Reusa `myStores` (posse = StoreStaff manager).
   * Vazio quando o usuário não tem vínculo. Também devolve os merchantIds das
   * redes do escopo (usado p/ agregar reviews, que têm alvo merchant — story 13).
   */
  async scopedStores(user: { id: string; roles: string[] }): Promise<{ storeIds: string[]; merchantIds: string[] }> {
    const scoped = await this.myStores(user.id);
    if (scoped.length === 0) return { storeIds: [], merchantIds: [] };
    const merchantIds = [...new Set(scoped.map((s) => s.merchantId))];
    // Só o owner enxerga toda a rede; admin e manager ficam nas lojas do vínculo (story 16).
    if ((await this.resolveLevel(user)) === "owner") {
      const stores = await this.prisma.store.findMany({
        where: { merchantId: { in: merchantIds } },
        select: { id: true },
      });
      return { storeIds: stores.map((s) => s.id), merchantIds };
    }
    return { storeIds: scoped.map((s) => s.id), merchantIds };
  }

  private async scopedStoreIds(user: { id: string; roles: string[] }): Promise<string[]> {
    return (await this.scopedStores(user)).storeIds;
  }

  /**
   * Lista os sub-pedidos (OrderGroup) das lojas no escopo (story 12). Filtra por
   * loja (validando o escopo) e por status. Card resumido p/ o board: nº/loja/
   * itens/total/horário/status/pickupCode. Usuário sem vínculo → FORBIDDEN.
   */
  async listOrders(
    user: { id: string; roles: string[] },
    filters: { storeId?: string; status?: string } = {},
  ) {
    const scoped = await this.scopedStoreIds(user);
    if (scoped.length === 0) {
      throw new ForbiddenException({ code: "NOT_A_MERCHANT_USER", message: "Usuário sem lojas no escopo" });
    }
    let storeIds = scoped;
    if (filters.storeId) {
      if (!scoped.includes(filters.storeId)) {
        throw new ForbiddenException({ code: "STORE_NOT_IN_SCOPE", message: "Loja fora do escopo do usuário" });
      }
      storeIds = [filters.storeId];
    }

    const groups = await this.prisma.orderGroup.findMany({
      where: {
        storeId: { in: storeIds },
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      orderBy: { order: { createdAt: "desc" } },
      include: {
        store: { select: { name: true } },
        order: { select: { createdAt: true } },
        _count: { select: { items: true } },
      },
    });

    return groups.map((g) => ({
      id: g.id,
      orderId: g.orderId,
      storeId: g.storeId,
      storeName: g.store.name,
      status: g.status,
      fulfillment: g.fulfillment,
      itemCount: g._count.items,
      totalCents: g.subtotalCents + g.deliveryCents + g.prepCents + g.platformFeeCents,
      pickupCode: g.pickupCode,
      createdAt: g.order.createdAt.toISOString(),
    }));
  }

  /**
   * Detalhe de um sub-pedido (OrderGroup) p/ o drawer do merchant (story 54):
   * itens linha a linha (+ separação/substituição), cumprimento, pagamento,
   * cliente e timeline de marcos. Capability `orders.view`. Grupo de loja fora do
   * escopo do ator → 404 (não vaza existência de pedido de outra loja).
   */
  async orderGroupDetail(user: { id: string; roles: string[] }, groupId: string) {
    const scoped = await this.scopedStoreIds(user);
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: groupId },
      include: {
        store: { select: { name: true } },
        pickTask: { select: { status: true, startedAt: true, packedAt: true, readyAt: true } },
        delivery: { select: { pickedUpAt: true, deliveredAt: true } },
        order: {
          select: {
            createdAt: true,
            scheduledFrom: true,
            scheduledTo: true,
            user: { select: { name: true } },
            payment: { select: { status: true, method: true, paidAt: true } },
          },
        },
        items: {
          orderBy: { nameSnapshot: "asc" },
          include: {
            pickItem: {
              select: {
                status: true,
                quantityPicked: true,
                weightGramsPicked: true,
                substitution: {
                  select: {
                    nameSnapshot: true,
                    unitPriceCents: true,
                    priceDiffCents: true,
                    approvalStatus: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!group || !scoped.includes(group.storeId)) {
      throw new NotFoundException({ code: "ORDER_GROUP_NOT_FOUND", message: "Sub-pedido não encontrado" });
    }

    const cancelable =
      (group.status === "created" || group.status === "paid" || group.status === "preparing") &&
      (!group.pickTask || group.pickTask.status === "queued" || group.pickTask.status === "assigned");

    return {
      id: group.id,
      orderId: group.orderId,
      storeId: group.storeId,
      storeName: group.store.name,
      status: group.status,
      fulfillment: group.fulfillment,
      createdAt: group.order.createdAt.toISOString(),
      subtotalCents: group.subtotalCents,
      deliveryCents: group.deliveryCents,
      prepCents: group.prepCents,
      platformFeeCents: group.platformFeeCents,
      totalCents: group.subtotalCents + group.deliveryCents + group.prepCents + group.platformFeeCents,
      pickupCode: group.pickupCode,
      scheduledFrom: group.order.scheduledFrom?.toISOString() ?? null,
      scheduledTo: group.order.scheduledTo?.toISOString() ?? null,
      payment: group.order.payment
        ? { status: group.order.payment.status, method: group.order.payment.method }
        : null,
      customer: { name: group.order.user.name, phone: null },
      items: group.items.map((i) => ({
        id: i.id,
        name: i.nameSnapshot,
        saleType: i.saleType,
        quantity: i.quantity,
        weightGrams: i.weightGrams,
        unitPriceCents: i.unitPriceCents,
        lineTotalCents: i.lineTotalCents,
        pickStatus: i.pickItem?.status ?? null,
        quantityPicked: i.pickItem?.quantityPicked ?? null,
        weightGramsPicked: i.pickItem?.weightGramsPicked ?? null,
        substitution: i.pickItem?.substitution
          ? {
              name: i.pickItem.substitution.nameSnapshot,
              unitPriceCents: i.pickItem.substitution.unitPriceCents,
              priceDiffCents: i.pickItem.substitution.priceDiffCents,
              approvalStatus: i.pickItem.substitution.approvalStatus,
            }
          : null,
      })),
      timeline: {
        createdAt: group.order.createdAt.toISOString(),
        paidAt: group.order.payment?.paidAt?.toISOString() ?? null,
        pickingStartedAt: group.pickTask?.startedAt?.toISOString() ?? null,
        packedAt: group.pickTask?.packedAt?.toISOString() ?? null,
        readyAt: group.pickTask?.readyAt?.toISOString() ?? null,
        pickedUpAt: group.delivery?.pickedUpAt?.toISOString() ?? null,
        deliveredAt: group.delivery?.deliveredAt?.toISOString() ?? null,
      },
      cancelable,
    };
  }

  /**
   * Cancela um sub-pedido (OrderGroup) da loja do ator (story 54). Capability
   * `orders.manage` (owner/admin/manager no escopo). Resolve o escopo de loja e
   * delega ao marketplace (dono do agregado) — grupo fora do escopo → 404 (lá).
   */
  async cancelOrderGroup(user: { id: string; roles: string[] }, groupId: string) {
    const storeIds = await this.scopedStoreIds(user);
    if (storeIds.length === 0) {
      throw new ForbiddenException({ code: "NOT_A_MERCHANT_USER", message: "Usuário sem lojas no escopo" });
    }
    return this.orders.cancelGroup(groupId, { storeIds });
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

/**
 * Converte "YYYY-MM-DD" numa Date UTC à meia-noite (casa com o `@db.Date` do
 * StoreClosure). Formato inválido → BadRequest INVALID_DATE.
 */
function parseClosureDate(raw: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw?.trim() ?? "");
  if (!m) {
    throw new BadRequestException({ code: "INVALID_DATE", message: "Data inválida (use YYYY-MM-DD)" });
  }
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ code: "INVALID_DATE", message: "Data inválida (use YYYY-MM-DD)" });
  }
  return date;
}
