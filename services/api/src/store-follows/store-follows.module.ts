import { Module } from "@nestjs/common";
import { StoreFollowsController } from "./store-follows.controller";
import { StoreFollowsService } from "./store-follows.service";

/** Seguir loja (story 34). Exporta o service p/ as sections lerem `following`. */
@Module({
  controllers: [StoreFollowsController],
  providers: [StoreFollowsService],
  exports: [StoreFollowsService],
})
export class StoreFollowsModule {}
