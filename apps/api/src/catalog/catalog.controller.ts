import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { CatalogService } from "./catalog.service";

/** Catálogo público (vitrine do app cliente). Somente leitura. */
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("feed")
  feed() {
    return this.catalog.feed();
  }

  @Get("marketplace-categories/:id/feed")
  categoryFeed(
    @Param("id") id: string,
    @Query("q") q?: string,
    @Query("storeId") storeId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.catalog.categoryFeed(id, {
      q,
      storeId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
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
  sections(@Param("id") id: string) {
    return this.catalog.storeSections(id);
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
