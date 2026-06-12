import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface HealthReport {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  checks: Record<string, "up" | "down">;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const checks: Record<string, "up" | "down"> = {};

    checks.database = await this.prisma.isHealthy() ? "up" : "down";

    const status = Object.values(checks).every((c) => c === "up") ? "ok" : "degraded";
    return {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
