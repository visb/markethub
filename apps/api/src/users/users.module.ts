import { Module } from "@nestjs/common";
import { AdminStoresController, AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  controllers: [AdminUsersController, AdminStoresController],
  providers: [AdminUsersService],
})
export class UsersModule {}
