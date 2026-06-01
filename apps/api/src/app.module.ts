import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AppConfigModule } from "./config/config.module";
import { AppLoggerModule } from "./common/logger/logger.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { QueueModule } from "./queue/queue.module";
import { ErpModule } from "./erp/erp.module";
import { EnrichmentModule } from "./enrichment/enrichment.module";
import { CatalogModule } from "./catalog/catalog.module";
import { UsersModule } from "./users/users.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { PaymentModule } from "./payment/payment.module";
import { PickingModule } from "./picking/picking.module";
import { MerchantModule } from "./merchant/merchant.module";
import { DriverModule } from "./driver/driver.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { RolesGuard } from "./auth/guards/roles.guard";

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    QueueModule,
    HealthModule,
    AuthModule,
    EnrichmentModule,
    ErpModule,
    CatalogModule,
    UsersModule,
    MarketplaceModule,
    PaymentModule,
    PickingModule,
    MerchantModule,
    DriverModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
