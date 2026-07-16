import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { AdminOrderSupportService } from "./admin-order-support.service";

class AdminCancelOrderDto {
  @IsOptional() @IsString() reason?: string;
}

class AdminManualRefundDto {
  @IsString() @MinLength(1) orderGroupId!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsOptional() @IsString() note?: string;
}

/**
 * Ferramentas de suporte sobre o pedido (story 67): timeline, cancelamento
 * admin (override — qualquer status não-terminal) e reembolso manual parcial.
 * Controller fino — regra no AdminOrderSupportService/marketplace. Somente admin.
 */
@Roles("admin")
@Controller("admin/dashboard/orders")
export class AdminOrdersController {
  constructor(private readonly support: AdminOrderSupportService) {}

  @Get(":id/timeline")
  timeline(@Param("id") id: string) {
    return this.support.timeline(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: AdminCancelOrderDto) {
    return this.support.cancel(id, dto.reason ?? null);
  }

  @Post(":id/refund")
  refund(@Param("id") id: string, @CurrentUser() user: AuthUser, @Body() dto: AdminManualRefundDto) {
    return this.support.manualRefund(id, user.id, {
      orderGroupId: dto.orderGroupId,
      amountCents: dto.amountCents,
      note: dto.note ?? null,
    });
  }
}
