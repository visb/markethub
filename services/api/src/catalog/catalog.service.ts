import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { etaMinutes, haversineKm } from "../common/geo";
import { PrismaService } from "../prisma/prisma.service";
import { DOOR_SURCHARGE_CENTS } from "../shared/pricing";
import { isStoreAvailable, nextOpening, todayHours } from "../shared/store-hours";
import { StoreFollowsService } from "../store-follows";

// Re-export dos helpers de horário (kernel `shared/store-hours`) mantendo o ponto
// de import histórico deste módulo (specs/consumidores existentes — story 52).
export { isOpenAt, saoPauloDayAndMinute } from "../shared/store-hours";

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Posição do cliente + raio de busca (S6.4); raio só filtra quando informado. */
export interface GeoFilter {
  lat: number;
  lng: number;
  radiusKm?: number;
}

/** Bounding box do viewport do mapa (bordas do retângulo visível). */
export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const MAX_PAGE_SIZE = 100;
/** Teto de marcadores por viewport — protege contra zoom-out total. */
export const NEARBY_STORES_CAP = 200;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeFollows: StoreFollowsService,
  ) {}

  listMerchants() {
    return this.prisma.merchant.findMany({
      where: { active: true },
      select: { id: true, name: true, slug: true, logoUrl: true },
      orderBy: { name: "asc" },
    });
  }

  async listStores(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw this.notFound("MERCHANT_NOT_FOUND", "Merchant not found");
    return this.prisma.store.findMany({
      where: { merchantId, active: true },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Lojas ativas dentro do viewport do mapa (bounding box). Filtra lat/lng no range
   * (descarta nulos), aplica o teto `NEARBY_STORES_CAP` e ordena pela proximidade ao
   * centro do box. Resposta enxuta (sem produtos) p/ marcadores — stories 05/06.
   */
  async listStoresInBounds(bounds: ViewportBounds) {
    const rows = await this.prisma.store.findMany({
      where: {
        active: true,
        latitude: { not: null, gte: bounds.south, lte: bounds.north },
        longitude: { not: null, gte: bounds.west, lte: bounds.east },
      },
      take: NEARBY_STORES_CAP,
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        avgPrepMinutes: true,
        merchant: { select: { name: true, logoUrl: true } },
      },
    });

    const centerLat = (bounds.north + bounds.south) / 2;
    const centerLng = (bounds.east + bounds.west) / 2;
    return rows
      .map((s) => ({
        id: s.id,
        name: s.name,
        latitude: s.latitude!,
        longitude: s.longitude!,
        city: s.city,
        state: s.state,
        avgPrepMinutes: s.avgPrepMinutes,
        merchantName: s.merchant.name,
        merchantLogoUrl: s.merchant.logoUrl,
      }))
      .sort(
        (a, b) =>
          haversineKm(centerLat, centerLng, a.latitude, a.longitude) -
          haversineKm(centerLat, centerLng, b.latitude, b.longitude),
      );
  }

  /** Categorias com ao menos um produto disponível na loja. */
  async listStoreCategories(storeId: string) {
    await this.assertStore(storeId);
    const rows = await this.prisma.offer.findMany({
      where: { storeId, available: true, product: { categoryId: { not: null } } },
      select: { product: { select: { category: { select: { id: true, name: true, slug: true } } } } },
      distinct: ["productId"],
    });
    const map = new Map<string, { id: string; name: string; slug: string }>();
    for (const r of rows) {
      const c = r.product.category;
      if (c) map.set(c.id, c);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Produtos disponíveis numa loja (com preço da oferta), paginado. */
  async listStoreProducts(
    storeId: string,
    opts: {
      categoryId?: string;
      marketplaceCategoryId?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<Paginated<unknown>> {
    await this.assertStore(storeId);
    const { page, pageSize, skip, take } = this.paginate(opts.page, opts.pageSize);

    const productFilter: Prisma.ProductWhereInput = {
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      ...(opts.marketplaceCategoryId
        ? { category: { marketplaceCategoryId: opts.marketplaceCategoryId } }
        : {}),
    };
    const where: Prisma.OfferWhereInput = {
      storeId,
      available: true,
      ...(Object.keys(productFilter).length ? { product: productFilter } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        skip,
        take,
        orderBy: { product: { name: "asc" } },
        select: this.offerSelect(),
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { items: rows.map(toOfferView), page, pageSize, total };
  }

  /** Busca por nome/marca/categoria. */
  async search(
    q: string,
    opts: { storeId?: string; page?: number; pageSize?: number },
  ): Promise<Paginated<unknown>> {
    const { page, pageSize, skip, take } = this.paginate(opts.page, opts.pageSize);
    const term = q.trim();
    if (term.length === 0) return { items: [], page, pageSize, total: 0 };

    const where: Prisma.OfferWhereInput = {
      available: true,
      ...(opts.storeId ? { storeId: opts.storeId } : {}),
      product: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { brand: { contains: term, mode: "insensitive" } },
          { category: { name: { contains: term, mode: "insensitive" } } },
        ],
      },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        skip,
        take,
        orderBy: { product: { name: "asc" } },
        select: this.offerSelect(),
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { items: rows.map(toOfferView), page, pageSize, total };
  }

  /** Detalhe do produto com ofertas por loja (preço/disponibilidade). */
  async productDetail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            // pergunta de preparo do departamento (S6.6)
            marketplaceCategory: { select: { prepOptions: true } },
          },
        },
        offers: {
          where: { available: true },
          select: {
            id: true,
            priceCents: true,
            promoPriceCents: true,
            store: { select: { id: true, name: true, merchant: { select: { name: true, logoUrl: true } } } },
          },
        },
      },
    });
    if (!product) throw this.notFound("PRODUCT_NOT_FOUND", "Product not found");
    const { category, ...rest } = product;
    const prep = category?.marketplaceCategory?.prepOptions as
      | { label?: string; options?: string[] }
      | null
      | undefined;
    return {
      ...rest,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      prepOptions:
        prep && typeof prep.label === "string" && Array.isArray(prep.options) && prep.options.length > 0
          ? { label: prep.label, options: prep.options.map(String) }
          : null,
    };
  }

  /** Seções da vitrine (MVP: regras simples). `userId` informa `following` (story 34). */
  async storeSections(storeId: string, geo?: GeoFilter, userId?: string, now: Date = new Date()) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        active: true,
        latitude: true,
        longitude: true,
        avgPrepMinutes: true,
        merchant: { select: { name: true, logoUrl: true, deliveryFeeCents: true } },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
        closures: { select: { date: true } },
      },
    });
    if (!store || !store.active) throw this.notFound("STORE_NOT_FOUND", "Store not found");
    const base: Prisma.OfferWhereInput = { storeId, available: true };

    const [featured, mostBought, recommended] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where: { ...base, promoPriceCents: { not: null } },
        take: 10,
        orderBy: { updatedAt: "desc" },
        select: this.offerSelect(),
      }),
      this.prisma.offer.findMany({
        where: base,
        take: 10,
        orderBy: { createdAt: "asc" },
        select: this.offerSelect(),
      }),
      this.prisma.offer.findMany({
        where: base,
        take: 10,
        orderBy: { product: { completenessScore: "desc" } },
        select: this.offerSelect(),
      }),
    ]);

    const hasGeo = geo && store.latitude != null && store.longitude != null;
    const distanceKm = hasGeo
      ? round1(haversineKm(geo.lat, geo.lng, store.latitude!, store.longitude!))
      : null;
    const following = userId ? await this.storeFollows.isFollowing(userId, storeId) : false;
    const closures = store.closures.map((c) => c.date);
    const next = nextOpening(store.hours, closures, now);
    return {
      store: {
        id: store.id,
        name: store.name,
        merchantName: store.merchant.name,
        merchantLogoUrl: store.merchant.logoUrl,
        deliveryFeeCents: store.merchant.deliveryFeeCents,
        distanceKm,
        etaMinutes: etaMinutes(store.avgPrepMinutes, distanceKm ?? 0),
        following,
        // Estado de funcionamento p/ o badge da página da loja (story 52).
        openNow: isStoreAvailable(store.hours, closures, now),
        todayHours: todayHours(store.hours, closures, now),
        nextOpen: next ? { dayOfWeek: next.dayOfWeek, opensAt: next.opensAt } : null,
      },
      featured: featured.map(toOfferView),
      mostBought: mostBought.map(toOfferView),
      recommended: recommended.map(toOfferView),
    };
  }

  /**
   * Resumo da loja para o modal do explore (story 29), buscado ao tocar o marker.
   * Monta endereço, ETA, faixa de frete (piso `deliveryFeeCents` / teto + surcharge
   * de entrega na porta), logo/merchant, `allowsPickup`, agrega `rating` das reviews
   * `axis=merchant` e computa `openNow` no servidor (timezone America/Sao_Paulo).
   * Loja inexistente/inativa → 404 STORE_NOT_FOUND.
   */
  async storeSummary(storeId: string, now: Date = new Date()) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        active: true,
        street: true,
        number: true,
        district: true,
        city: true,
        state: true,
        phone: true,
        allowsPickup: true,
        avgPrepMinutes: true,
        merchantId: true,
        merchant: { select: { name: true, logoUrl: true, deliveryFeeCents: true } },
        hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
        closures: { select: { date: true } },
      },
    });
    if (!store || !store.active) throw this.notFound("STORE_NOT_FOUND", "Store not found");

    const agg = await this.prisma.review.aggregate({
      where: { axis: "merchant", targetMerchantId: store.merchantId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const count = agg._count._all;
    const rating =
      count > 0 && agg._avg.rating != null
        ? { average: round1(agg._avg.rating), count }
        : null;

    return {
      id: store.id,
      name: store.name,
      merchantName: store.merchant.name,
      merchantLogoUrl: store.merchant.logoUrl,
      address: {
        street: store.street,
        number: store.number,
        district: store.district,
        city: store.city,
        state: store.state,
      },
      phone: store.phone,
      rating,
      etaMinutes: store.avgPrepMinutes,
      deliveryFeeCents: store.merchant.deliveryFeeCents,
      doorFeeCents: store.merchant.deliveryFeeCents + DOOR_SURCHARGE_CENTS,
      allowsPickup: store.allowsPickup,
      // Fechamento excepcional do dia (story 52) sobrepõe o horário semanal.
      openNow: isStoreAvailable(store.hours, store.closures.map((c) => c.date), now),
    };
  }

  /**
   * Feed da home do marketplace: por departamento curado, produtos de VÁRIOS mercados
   * (cada card traz o mercado + frete + tempo). Proximidade real entra com geo (Fase 4).
   */
  async feed(opts: { limitPerCategory?: number; geo?: GeoFilter } = {}) {
    const take = Math.min(20, Math.max(1, opts.limitPerCategory ?? 10));
    const cats = await this.prisma.marketplaceCategory.findMany({
      where: { visible: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    });

    const sections = await Promise.all(
      cats.map(async (cat) => ({
        category: cat,
        items: await this.categoryOffers(cat.id, take, 0, { geo: opts.geo }),
      })),
    );

    return sections.filter((s) => s.items.length > 0);
  }

  /**
   * Produtos de uma categoria curada. Global (vários mercados) ou de uma loja (storeId).
   * Busca opcional (q) é restrita à categoria (e à loja, se informada).
   */
  async categoryFeed(
    marketplaceCategoryId: string,
    opts: { page?: number; pageSize?: number; q?: string; storeId?: string; geo?: GeoFilter } = {},
  ) {
    const cat = await this.prisma.marketplaceCategory.findUnique({
      where: { id: marketplaceCategoryId },
      select: { id: true, name: true, slug: true },
    });
    if (!cat) throw this.notFound("CATEGORY_NOT_FOUND", "Categoria não encontrada");
    const { page, pageSize, skip, take } = this.paginate(opts.page, opts.pageSize);
    const items = await this.categoryOffers(marketplaceCategoryId, take, skip, {
      q: opts.q,
      storeId: opts.storeId,
      geo: opts.geo,
    });
    return { category: cat, items, page, pageSize };
  }

  private async categoryOffers(
    marketplaceCategoryId: string,
    take: number,
    skip = 0,
    opts: { q?: string; storeId?: string; geo?: GeoFilter; now?: Date } = {},
  ) {
    const now = opts.now ?? new Date();
    const q = opts.q?.trim();
    const offers = await this.prisma.offer.findMany({
      where: {
        available: true,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        product: {
          category: { marketplaceCategoryId },
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { brand: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
      },
      // raio (S6.4): busca um excedente p/ compensar lojas filtradas pela distância
      take: opts.geo?.radiusKm != null ? take * 3 : take,
      skip,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        priceCents: true,
        promoPriceCents: true,
        store: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            avgPrepMinutes: true,
            merchant: { select: { name: true, logoUrl: true, deliveryFeeCents: true } },
            hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
            closures: { select: { date: true } },
          },
        },
        product: {
          select: { id: true, name: true, brand: true, packageSize: true, saleType: true, imageUrl: true },
        },
      },
    });
    const views = offers.map((o) => toFeedView(o, opts.geo, now));
    const filtered =
      opts.geo?.radiusKm != null
        ? views.filter((v) => v.distanceKm != null && v.distanceKm <= opts.geo!.radiusKm!)
        : views;
    return filtered.slice(0, take);
  }

  // ─── helpers ───
  private offerSelect() {
    return {
      id: true,
      priceCents: true,
      promoPriceCents: true,
      product: {
        select: {
          id: true,
          name: true,
          brand: true,
          packageSize: true,
          saleType: true,
          imageUrl: true,
          gtin: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    } satisfies Prisma.OfferSelect;
  }

  private paginate(page?: number, pageSize?: number) {
    const p = Math.max(1, page ?? 1);
    const size = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
    return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
  }

  private async assertStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || !store.active) throw this.notFound("STORE_NOT_FOUND", "Store not found");
  }

  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message });
  }
}

type OfferRow = {
  id: string;
  priceCents: number;
  promoPriceCents: number | null;
  product: {
    id: string;
    name: string;
    brand: string | null;
    packageSize: string | null;
    saleType: "unit" | "weight";
    imageUrl: string | null;
    gtin: string | null;
    category: { id: string; name: string; slug: string } | null;
  };
};

/** Achata oferta+produto para o formato consumido pela vitrine. */
function toOfferView(row: OfferRow) {
  return {
    offerId: row.id,
    priceCents: row.priceCents,
    promoPriceCents: row.promoPriceCents,
    ...row.product,
  };
}

type FeedRow = {
  id: string;
  priceCents: number;
  promoPriceCents: number | null;
  store: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    avgPrepMinutes: number;
    merchant: { name: string; logoUrl: string | null; deliveryFeeCents: number };
    hours: { dayOfWeek: number; opensAt: number; closesAt: number }[];
    closures: { date: Date }[];
  };
  product: {
    id: string;
    name: string;
    brand: string | null;
    packageSize: string | null;
    saleType: "unit" | "weight";
    imageUrl: string | null;
  };
};

/**
 * Card do feed multi-mercado: produto + mercado + frete + tempo. Com geo, calcula
 * distância e ETA real (preparo da loja + deslocamento, S6.7); sem geo, ETA usa só
 * o preparo (sem distância). `openNow` (story 52) dirige o selo "Fechado" no card.
 */
function toFeedView(row: FeedRow, geo?: GeoFilter, now: Date = new Date()) {
  const hasGeo = geo && row.store.latitude != null && row.store.longitude != null;
  const distanceKm = hasGeo
    ? round1(haversineKm(geo.lat, geo.lng, row.store.latitude!, row.store.longitude!))
    : null;
  const eta = etaMinutes(row.store.avgPrepMinutes, distanceKm ?? 0);
  return {
    offerId: row.id,
    priceCents: row.priceCents,
    promoPriceCents: row.promoPriceCents,
    storeId: row.store.id,
    merchant: row.store.merchant.name,
    merchantLogoUrl: row.store.merchant.logoUrl,
    deliveryFeeCents: row.store.merchant.deliveryFeeCents,
    deliveryEta: `${eta} min`,
    etaMinutes: eta,
    distanceKm,
    openNow: isStoreAvailable(row.store.hours, row.store.closures.map((c) => c.date), now),
    ...row.product,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
