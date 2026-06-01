import { Controller, Post } from "@nestjs/common";
import { Roles } from "../auth/decorators/roles.decorator";
import { OfferService } from "./offer.service";
import { RoutingService } from "./routing.service";

/** Operações de matching/oferta para admin/teste (dispara os motores sob demanda). */
@Roles("admin")
@Controller("admin/delivery")
export class DeliveryAdminController {
  constructor(
    private readonly routing: RoutingService,
    private readonly offers: OfferService,
  ) {}

  /** Monta rotas das separações prontas e direciona ofertas aos disponíveis. */
  @Post("match")
  async match() {
    const created = await this.routing.buildPendingRoutes();
    const assigned = await this.offers.assignOffers();
    return { created, assigned };
  }
}
