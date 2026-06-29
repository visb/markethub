import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CatalogService, type GeoFilter } from "./catalog.service";
import { StoresNearbyQueryDto } from "./dto/stores-nearby.dto";

/** lat/lng/radiusKm de query string → filtro geo (undefined quando ausentes/inválidos). */
function parseGeo(lat?: string, lng?: string, radiusKm?: string): GeoFilter | undefined {
  const la = lat ? Number(lat) : NaN;
  const ln = lng ? Number(lng) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return undefined;
  const r = radiusKm ? Number(radiusKm) : NaN;
  return { lat: la, lng: ln, ...(Number.isFinite(r) && r > 0 ? { radiusKm: r } : {}) };
}

/** Catálogo público (vitrine do app cliente). Somente leitura. */
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("feed")
  feed(
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("radiusKm") radiusKm?: string,
  ) {
    return this.catalog.feed({ geo: parseGeo(lat, lng, radiusKm) });
  }

  @Get("marketplace-categories/:id/feed")
  categoryFeed(
    @Param("id") id: string,
    @Query("q") q?: string,
    @Query("storeId") storeId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Query("radiusKm") radiusKm?: string,
  ) {
    return this.catalog.categoryFeed(id, {
      q,
      storeId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      geo: parseGeo(lat, lng, radiusKm),
    });
  }

  @Get("merchants")
  merchants() {
    return this.catalog.listMerchants();
  }

  @Get("merchants/:id/stores")
  stores(@Param("id") id: string) {
    return this.catalog.listStores(id);
  }

  /**
   * Lojas no viewport do mapa (bounding box). Rota estática registrada ANTES de
   * `stores/:id/...` p/ o Nest casar a literal `nearby` antes de `:id`.
   * Bounds inválidos (ordem trocada) → 400 INVALID_BOUNDS.
   */
  @Get("stores/nearby")
  storesNearby(@Query() q: StoresNearbyQueryDto) {
    if (q.north < q.south || q.east < q.west) {
      throw new BadRequestException({
        code: "INVALID_BOUNDS",
        message: "Bounding box inválido: north ≥ south e east ≥ west.",
      });
    }
    return this.catalog.listStoresInBounds(q);
  }

  /**
   * Resumo da loja para o modal do explore (story 29). Rota estática `summary`
   * (dois segmentos) não colide com `stores/nearby` (um segmento), casada após ela.
   * Loja inexistente/inativa → 404 STORE_NOT_FOUND.
   */
  @Get("stores/:id/summary")
  storeSummary(@Param("id") id: string) {
    return this.catalog.storeSummary(id);
  }

  @Get("stores/:id/categories")
  categories(@Param("id") id: string) {
    return this.catalog.listStoreCategories(id);
  }

  @Get("stores/:id/products")
  products(
    @Param("id") id: string,
    @Query("categoryId") categoryId?: string,
    @Query("marketplaceCategoryId") marketplaceCategoryId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.catalog.listStoreProducts(id, {
      categoryId,
      marketplaceCategoryId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * Vitrine da loja. Auth OPCIONAL (story 34): com token de cliente, `following`
   * reflete se o usuário já segue a loja; guest → `following: false`.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get("stores/:id/sections")
  sections(
    @Param("id") id: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.catalog.storeSections(id, parseGeo(lat, lng, undefined), user?.id);
  }

  @Get("search")
  search(
    @Query("q") q = "",
    @Query("storeId") storeId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.catalog.search(q, {
      storeId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("products/:id")
  product(@Param("id") id: string) {
    return this.catalog.productDetail(id);
  }
}
