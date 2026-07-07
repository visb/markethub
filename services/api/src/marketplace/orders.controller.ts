import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { OrdersService } from "./orders.service";

@Roles("customer")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.orders.list(user.id, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.detail(user.id, id);
  }

  /** Rastreio por etapas do pedido (S5.1) — snapshot inicial; updates via Socket.IO. */
  @Get(":id/tracking")
  tracking(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.getTracking(user.id, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.cancel(user.id, id);
  }
}
