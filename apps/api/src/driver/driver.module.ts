import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { Env } from "../config/env";
import { DeliveryAdminController } from "./delivery-admin.controller";
import { DeliveryEvents } from "./delivery.events";
import { DriverController } from "./driver.controller";
import { DriverService } from "./driver.service";
import { OfferService } from "./offer.service";
import { GoogleRouteProvider } from "./providers/google.route-provider";
import { HaversineRouteProvider } from "./providers/haversine.route-provider";
import { ROUTE_PROVIDER } from "./route-provider.interface";
import { RoutingScheduler } from "./routing.scheduler";
import { RoutingService } from "./routing.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DriverController, DeliveryAdminController],
  providers: [
    DriverService,
    RoutingService,
    RoutingScheduler,
    OfferService,
    DeliveryEvents,
    {
      provide: ROUTE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const provider = config.get("ROUTING_PROVIDER", { infer: true });
        const key = config.get("GOOGLE_MAPS_API_KEY", { infer: true });
        const log = new Logger("DriverModule");
        if (provider === "google" && key) {
          log.log("Using Google route provider");
          return new GoogleRouteProvider(key);
        }
        log.warn("Using mock (haversine) route provider");
        return new HaversineRouteProvider();
      },
    },
  ],
  exports: [DriverService, RoutingService, OfferService],
})
export class DriverModule {}
