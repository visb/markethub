import { Body, Controller, Delete, Post } from "@nestjs/common";
import type { DevicePlatform } from "@prisma/client";
import { IsIn, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth";
import type { AuthUser } from "../auth";
import { PushService } from "./push.service";

class RegisterTokenDto {
  @IsString() @MinLength(1) token!: string;
  @IsIn(["ios", "android", "web"]) platform!: DevicePlatform;
}

class UnregisterTokenDto {
  @IsString() @MinLength(1) token!: string;
}

/** Registro de tokens de device p/ push (S5.6). Qualquer usuário autenticado. */
@Controller("notifications/device-tokens")
export class NotificationsController {
  constructor(private readonly push: PushService) {}

  @Post()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterTokenDto) {
    return this.push.registerToken(user.id, dto.platform, dto.token);
  }

  @Delete()
  unregister(@Body() dto: UnregisterTokenDto) {
    return this.push.removeToken(dto.token);
  }
}
