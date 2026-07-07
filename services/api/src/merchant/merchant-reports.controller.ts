import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth";
import type { AuthUser } from "../auth";
import { MerchantReportsService } from "./merchant-reports.service";

/**
 * Relatórios do app merchant (story 13). Sem `@Roles` de classe (como
 * staff/orders/context): owner (RoleName `merchant`) e manager (StoreStaff
 * manager) precisam alcançar a rota. O escopo de loja/rede é reforçado no
 * service (`resolveScope`) — gerente só vê as suas lojas.
 */
@Controller("merchant/reports")
export class MerchantReportsController {
  constructor(private readonly reports: MerchantReportsService) {}

  @Get("sales")
  sales(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("storeId") storeId?: string,
  ) {
    return this.reports.sales({ id: user.id, roles: user.roles }, { from, to, storeId });
  }

  @Get("operations")
  operations(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("storeId") storeId?: string,
  ) {
    return this.reports.operations({ id: user.id, roles: user.roles }, { from, to, storeId });
  }

  @Get("top-products")
  topProducts(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("storeId") storeId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.reports.topProducts(
      { id: user.id, roles: user.roles },
      { from, to, storeId },
      limit ? Number(limit) : undefined,
    );
  }

  @Get("reviews")
  reviews(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("storeId") storeId?: string,
  ) {
    return this.reports.reviews({ id: user.id, roles: user.roles }, { from, to, storeId });
  }
}
