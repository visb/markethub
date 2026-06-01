import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, Max, Min } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { DriverService } from "./driver.service";

class SetStatusDto {
  @IsIn(["offline", "available"]) status!: "offline" | "available";
  @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
}

class LocationDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
}

@Roles("driver")
@Controller("driver")
export class DriverController {
  constructor(private readonly driver: DriverService) {}

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
}
