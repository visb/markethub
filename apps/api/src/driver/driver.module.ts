import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { DriverController } from "./driver.controller";
import { DriverService } from "./driver.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
