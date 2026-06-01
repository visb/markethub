import { Controller, Post } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { RoutingService } from "./routing.service";

/** Operações de matching para admin/teste (dispara o motor de rotas sob demanda). */
@Roles("admin")
@Controller("admin/delivery")
export class DeliveryAdminController {
  constructor(private readonly routing: RoutingService) {}

  @Post("match")
  async match() {
    const created = await this.routing.buildPendingRoutes();
    return { created };
  }
}
