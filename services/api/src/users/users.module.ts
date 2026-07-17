import { Module } from "@nestjs/common";
import { AdminStoresController, AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

@Module({
  controllers: [AdminUsersController, AdminStoresController, MeController],
  providers: [AdminUsersService, MeService],
  exports: [AdminUsersService],
})
export class UsersModule {}
