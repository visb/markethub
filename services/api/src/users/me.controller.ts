import { Body, Controller, HttpCode, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { ChangePasswordDto, UpdateMeDto } from "./dto/me.dto";
import { MeService } from "./me.service";

/**
 * Conta do usuário autenticado (story 70). A leitura do perfil vive em
 * GET auth/me (estendida com phone — não duplicada aqui); este controller cobre
 * a escrita: PATCH parcial de nome/telefone e troca de senha.
 */
@Controller("users/me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.me.updateProfile(user.id, { name: dto.name, phone: dto.phone });
  }

  @HttpCode(200)
  @Post("password")
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.me.changePassword(user.id, user.sessionId, dto);
  }
}
