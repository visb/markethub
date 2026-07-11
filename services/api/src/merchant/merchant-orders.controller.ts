import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth";
import type { AuthUser } from "../auth";
import { CancelOrderGroupDto } from "./dto/cancel-order-group.dto";
import { MerchantService } from "./merchant.service";

/**
 * Pedidos em tempo real (story 12) + detalhe/ações do sub-pedido (story 54). Sem
 * `@Roles` de classe (como o staff/context controllers): owner (RoleName
 * `merchant`) e manager (RoleName `customer` + StoreStaff manager) precisam
 * alcançar a rota. O escopo de loja e as capabilities (`orders.view` p/ ler,
 * `orders.manage` p/ cancelar) são reforçados no service — a tela nunca é a fonte
 * da verdade (CLAUDE.md).
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

  /** Detalhe de um sub-pedido (itens, pagamento, cliente, timeline) — `orders.view`. */
  @Get("groups/:id")
  orderGroupDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.merchant.orderGroupDetail({ id: user.id, roles: user.roles }, id);
  }

  /** Cancela o sub-pedido da loja do ator — `orders.manage`. */
  @Post("groups/:id/cancel")
  cancelOrderGroup(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() _body: CancelOrderGroupDto,
  ) {
    return this.merchant.cancelOrderGroup({ id: user.id, roles: user.roles }, id);
  }
}
