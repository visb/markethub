import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { DriverService } from "./driver.service";
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

/** App do entregador (entrega própria): lojas, fila de entregas, coleta e entrega. */
@Roles("driver")
@Controller("driver")
export class DriverController {
  constructor(
    private readonly driver: DriverService,
    private readonly vehicles: DriverVehicleService,
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
