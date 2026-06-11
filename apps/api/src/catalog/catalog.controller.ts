import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { CatalogService, type GeoFilter } from "./catalog.service";

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

  @Get("stores/:id/sections")
  sections(
    @Param("id") id: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
  ) {
    return this.catalog.storeSections(id, parseGeo(lat, lng, undefined));
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
