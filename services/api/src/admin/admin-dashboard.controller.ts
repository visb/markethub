import { Controller, Get, Param, Query } from "@nestjs/common";
import type { OrderStatus } from "@prisma/client";
import { Roles } from "../auth";
import { ReviewsAggregateService } from "../reviews";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminDashboardSummaryService } from "./admin-dashboard-summary.service";

const toDate = (s?: string) => (s ? new Date(s) : undefined);

/** Dashboard admin (S5.4): pedidos, operação e financeiro. Somente admin. */
@Roles("admin")
@Controller("admin/dashboard")
export class AdminDashboardController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly reviews: ReviewsAggregateService,
    private readonly summaryService: AdminDashboardSummaryService,
  ) {}

  /** Agregador da home do admin (story 66): KPIs + filas + alertas numa chamada. */
  @Get()
  summary() {
    return this.summaryService.summary();
  }

  @Get("orders")
  orders(
    @Query("status") status?: string,
    @Query("storeId") storeId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
  ) {
    return this.dashboard.orders({
      status: status as OrderStatus | undefined,
      storeId,
      from: toDate(from),
      to: toDate(to),
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      q: q || undefined,
    });
  }

  @Get("orders/:id")
  orderDetail(@Param("id") id: string) {
    return this.dashboard.orderDetail(id);
  }

  @Get("operations")
  operations(@Query("storeId") storeId?: string) {
    return this.dashboard.operations(storeId);
  }

  @Get("finance")
  finance(@Query("from") from?: string, @Query("to") to?: string, @Query("storeId") storeId?: string) {
    return this.dashboard.finance({ from: toDate(from), to: toDate(to), storeId });
  }

  @Get("driver-tips")
  driverTips(@Query("from") from?: string, @Query("to") to?: string) {
    return this.dashboard.driverTips({ from: toDate(from), to: toDate(to) });
  }

  @Get("reviews")
  reviewsAgg() {
    return this.reviews.platform();
  }
}
