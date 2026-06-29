import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { IsString, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { StoreFollowsService } from "./store-follows.service";

class FollowStoreDto {
  @IsString() @MinLength(1) storeId!: string;
}

/** Lojas seguidas pelo cliente (story 34). */
@Roles("customer")
@Controller("store-follows")
export class StoreFollowsController {
  constructor(private readonly follows: StoreFollowsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.follows.list(user.id);
  }

  @Post()
  follow(@CurrentUser() user: AuthUser, @Body() dto: FollowStoreDto) {
    return this.follows.follow(user.id, dto.storeId);
  }

  @Delete(":storeId")
  unfollow(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
    return this.follows.unfollow(user.id, storeId);
  }
}
