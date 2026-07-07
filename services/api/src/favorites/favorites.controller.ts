import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { FavoritesService } from "./favorites.service";

class AddFavoriteDto {
  @IsString() @MinLength(1) offerId!: string;
}

/** Favoritos de oferta do cliente (S6.5). */
@Roles("customer")
@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.favorites.list(user.id);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body() dto: AddFavoriteDto) {
    return this.favorites.add(user.id, dto.offerId);
  }

  @Delete(":offerId")
  remove(@CurrentUser() user: AuthUser, @Param("offerId") offerId: string) {
    return this.favorites.remove(user.id, offerId);
  }
}
