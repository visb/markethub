import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { DriverService } from "./driver.service";
import { DriverLocationService } from "./driver-location.service";
import { DriverVehicleService } from "./driver-vehicle.service";

class ConfirmPickupDto {
  @IsString() @MinLength(1) pickupCode!: string;
}

class ConfirmDeliveryDto {
  @IsString() @MinLength(1) deliveryCode!: string;
}

class SelectVehicleDto {
  @IsString() @MinLength(1) vehicleId!: string;
}

class LocationDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(360) heading?: number;
  @IsISO8601() recordedAt!: string;
}

class EarningsQueryDto {
  @IsOptional() @IsIn(["today", "7d", "30d"]) period?: "today" | "7d" | "30d";
}

/** App do entregador (entrega própria): lojas, fila de entregas, coleta e entrega. */
@Roles("driver")
@Controller("driver")
export class DriverController {
  constructor(
    private readonly driver: DriverService,
    private readonly vehicles: DriverVehicleService,
    private readonly location: DriverLocationService,
  ) {}

  /** Lojas em que o usuário atua como entregador. */
  @Get("stores")
  stores(@CurrentUser() user: AuthUser) {
    return this.driver.myStores(user.id);
  }

  /** Entregas atribuídas ao entregador (filtra por loja/status). */
  @Get("deliveries")
  deliveries(
    @CurrentUser() user: AuthUser,
    @Query("storeId") storeId?: string,
    @Query("status") status?: string,
  ) {
    return this.driver.listAssigned(user.id, { storeId, status });
  }

  /** Pool: entregas prontas e sem entregador nas lojas do entregador. */
  @Get("deliveries/available")
  available(@CurrentUser() user: AuthUser, @Query("storeId") storeId?: string) {
    return this.driver.listAvailable(user.id, { storeId });
  }

  /** Ganhos do entregador (gorjetas + entregas concluídas) no período (story 60). */
  @Get("earnings")
  earnings(@CurrentUser() user: AuthUser, @Query() query: EarningsQueryDto) {
    return this.driver.earnings(user.id, query.period ?? "today");
  }

  /** Histórico paginado de entregas concluídas/canceladas do entregador (story 60). */
  @Get("deliveries/history")
  deliveryHistory(@CurrentUser() user: AuthUser, @Query("page") page?: string) {
    return this.driver.deliveryHistory(user.id, page ? Number(page) : 1);
  }

  /** Aceita uma entrega do pool (auto-atribuição). */
  @Post("deliveries/:id/accept")
  accept(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.driver.accept(user.id, id);
  }

  /** Coleta na loja: valida o pickupCode. */
  @Post("deliveries/:id/pickup")
  pickup(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ConfirmPickupDto) {
    return this.driver.confirmPickup(user.id, id, dto.pickupCode);
  }

  /** Entrega ao cliente: valida o deliveryCode. */
  @Post("deliveries/:id/deliver")
  deliver(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ConfirmDeliveryDto) {
    return this.driver.confirmDelivery(user.id, id, dto.deliveryCode);
  }

  /**
   * Rastreio ao vivo (story 51): publica a posição do entregador (ingest REST
   * throttled). Só o dono da entrega e apenas em trânsito (coletada). O backend
   * faz o fan-out via Socket.IO ao cliente do pedido.
   */
  @Post("deliveries/:id/location")
  publishLocation(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: LocationDto) {
    return this.location.ingest(user.id, id, dto);
  }

  /** Veículos `active` da rede do entregador, p/ seleção no login (story 15). */
  @Get("vehicles")
  vehicles_(@CurrentUser() user: AuthUser) {
    return this.vehicles.listAvailable(user.id);
  }

  /** Veículo atualmente selecionado pelo entregador (ou null). */
  @Get("vehicle/current")
  currentVehicle(@CurrentUser() user: AuthUser) {
    return this.vehicles.current(user.id);
  }

  /** Seleciona/troca o veículo do turno (valida escopo+active no backend). */
  @Put("vehicle")
  selectVehicle(@CurrentUser() user: AuthUser, @Body() dto: SelectVehicleDto) {
    return this.vehicles.select(user.id, dto.vehicleId);
  }
}
