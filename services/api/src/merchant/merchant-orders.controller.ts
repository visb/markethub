import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { MerchantService } from "./merchant.service";

/**
 * Pedidos em tempo real (story 12). Sem `@Roles` de classe (como o staff/context
 * controllers): owner (RoleName `merchant`) e manager (RoleName `customer` +
 * StoreStaff manager) precisam alcançar a rota. O escopo de loja é reforçado no
 * `MerchantService.listOrders` — a tela nunca é a fonte da verdade (CLAUDE.md).
 */
@Controller("merchant/orders")
export class MerchantOrdersController {
  constructor(private readonly merchant: MerchantService) {}

  @Get()
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query("storeId") storeId?: string,
    @Query("status") status?: string,
  ) {
    return this.merchant.listOrders({ id: user.id, roles: user.roles }, { storeId, status });
  }
}
