import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth";
import { HealthService } from "./health.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check() {
    return this.health.check();
  }
}
