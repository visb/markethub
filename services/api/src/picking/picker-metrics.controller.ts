import { Controller, Get, Query } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { CurrentUser, Roles } from "../auth";
import type { AuthUser } from "../auth";
import { PickerMetricsService } from "./picker-metrics.service";
import type { PickerMetricsPeriod } from "./picker-metrics.service";

class PickerMetricsQueryDto {
  @IsOptional() @IsIn(["today", "7d", "30d"]) period?: PickerMetricsPeriod;
}

/** Métricas próprias do separador (story 65) — "Meu desempenho" no app do picker. */
@Roles("picker")
@Controller("picking/metrics")
export class PickerMetricsController {
  constructor(private readonly metrics: PickerMetricsService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser, @Query() query: PickerMetricsQueryDto) {
    return this.metrics.myMetrics(user.id, query.period ?? "today");
  }
}
