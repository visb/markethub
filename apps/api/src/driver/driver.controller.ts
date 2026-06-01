import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { DriverService } from "./driver.service";
import { OfferService } from "./offer.service";
import { RouteExecutionService } from "./route-execution.service";

class SetStatusDto {
  @IsIn(["offline", "available"]) status!: "offline" | "available";
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
}

class LocationDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
}

class ConfirmDeliveryDto {
  @IsString() @MinLength(1) deliveryCode!: string;
}

@Roles("driver")
@Controller("driver")
export class DriverController {
  constructor(
    private readonly driver: DriverService,
    private readonly offers: OfferService,
    private readonly execution: RouteExecutionService,
  ) {}

  /** Perfil + status + rota ativa. */
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.driver.me(user.id);
  }

  /** Alterna disponibilidade (offline|available). */
  @Patch("status")
  setStatus(@CurrentUser() user: AuthUser, @Body() dto: SetStatusDto) {
    return this.driver.setStatus(user.id, dto.status, dto.lat, dto.lng);
  }

  /** Heartbeat de localização. */
  @Post("location")
  location(@CurrentUser() user: AuthUser, @Body() dto: LocationDto) {
    return this.driver.heartbeat(user.id, dto.lat, dto.lng);
  }

  // ── Oferta de rota (S4.4) ──

  /** Oferta de rota corrente direcionada ao entregador (ou null). */
  @Get("routes/offer")
  offer(@CurrentUser() user: AuthUser) {
    return this.offers.currentOffer(user.id);
  }

  /** Aceita a oferta (lock otimista). */
  @Post("routes/:id/accept")
  accept(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.offers.accept(user.id, id);
  }

  /** Recusa a oferta (reoferta a outro entregador). */
  @Post("routes/:id/reject")
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.offers.reject(user.id, id);
  }

  // ── Execução: coleta (S4.5) ──

  /** Chega na parada (coleta ou entrega). */
  @Post("routes/:id/stops/:stopId/arrive")
  arrive(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("stopId") stopId: string) {
    return this.execution.arrive(user.id, id, stopId);
  }

  /** "Saí da coleta": fecha a parada de coleta (exige loja ter liberado). */
  @Post("routes/:id/stops/:stopId/leave")
  leave(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("stopId") stopId: string) {
    return this.execution.leavePickup(user.id, id, stopId);
  }

  // ── Execução: entrega (S4.6) ──

  /** Confirma a entrega validando o deliveryCode do cliente. */
  @Post("routes/:id/stops/:stopId/confirm")
  confirm(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("stopId") stopId: string,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.execution.confirmDropoff(user.id, id, stopId, dto.deliveryCode);
  }

  /** "Finalizar Entrega": fecha a parada e, sendo a última, conclui a rota. */
  @Post("routes/:id/stops/:stopId/complete")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("stopId") stopId: string) {
    return this.execution.completeDropoff(user.id, id, stopId);
  }
}
