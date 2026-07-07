import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { SubstitutionService } from "./substitution.service";

/** Aprovação de substituições pelo cliente (S3.4). Escopo: dono do pedido. */
@Roles("customer")
@Controller("orders/:orderId/substitutions")
export class SubstitutionController {
  constructor(private readonly substitution: SubstitutionService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("orderId") orderId: string) {
    return this.substitution.listForOrder(user.id, orderId);
  }

  @Post(":subId/approve")
  approve(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Param("subId") subId: string,
  ) {
    return this.substitution.approve(user.id, orderId, subId);
  }

  @Post(":subId/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("orderId") orderId: string,
    @Param("subId") subId: string,
  ) {
    return this.substitution.reject(user.id, orderId, subId);
  }
}
