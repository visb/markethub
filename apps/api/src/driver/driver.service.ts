import { BadRequestException, Injectable } from "@nestjs/common";
import type { DriverStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ROUTE_INCLUDE, toDriverProfileDto, toRouteDto } from "./delivery.mapper";

/** Janela de staleness: entregador só conta como online se visto nos últimos 2 min. */
export const DRIVER_STALE_MS = 2 * 60 * 1000;

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante o perfil 1:1 do entregador (cria lazy no primeiro acesso). */
  private profile(userId: string) {
    return this.prisma.driverProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /** Perfil + status + rota ativa (se houver). */
  async me(userId: string) {
    const profile = await this.profile(userId);
    const activeRoute = await this.prisma.deliveryRoute.findFirst({
      where: { driverId: userId, status: { in: ["accepted", "in_progress"] } },
      orderBy: { acceptedAt: "desc" },
      include: ROUTE_INCLUDE,
    });
    return {
      profile: toDriverProfileDto(profile),
      activeRoute: activeRoute ? toRouteDto(activeRoute) : null,
    };
  }

  /** Alterna disponibilidade. `available` exige localização. `on_route` não pode ir offline. */
  async setStatus(userId: string, status: "offline" | "available", lat?: number, lng?: number) {
    const profile = await this.profile(userId);
    if (profile.status === "on_route") {
      throw new BadRequestException({
        code: "DRIVER_ON_ROUTE",
        message: "Conclua ou cancele a rota antes de mudar o status",
      });
    }
    if (status === "available" && (lat == null || lng == null)) {
      throw new BadRequestException({
        code: "LOCATION_REQUIRED",
        message: "Localização é obrigatória para ficar disponível",
      });
    }
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: {
        status: status as DriverStatus,
        lastSeenAt: new Date(),
        ...(status === "available" ? { currentLat: lat, currentLng: lng } : {}),
      },
    });
    return toDriverProfileDto(updated);
  }

  /** Heartbeat de localização (atualiza posição + lastSeenAt). */
  async heartbeat(userId: string, lat: number, lng: number) {
    await this.profile(userId);
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: { currentLat: lat, currentLng: lng, lastSeenAt: new Date() },
    });
    return toDriverProfileDto(updated);
  }

  /** Pool de matching (S4.3/S4.4): disponíveis e vistos recentemente. */
  listAvailable() {
    const since = new Date(Date.now() - DRIVER_STALE_MS);
    return this.prisma.driverProfile.findMany({
      where: { status: "available", lastSeenAt: { gte: since } },
    });
  }

  /**
   * Ganhos do dia (S4.7): total creditado (snapshot estimatedEarningsCents das
   * rotas concluídas no dia), nº de rotas finalizadas e aceitas no dia. `date`
   * opcional (YYYY-MM-DD) — default = hoje (fuso do servidor).
   */
  async earnings(userId: string, date?: string) {
    const { start, end } = dayWindow(date);
    const completed = await this.prisma.deliveryRoute.findMany({
      where: { driverId: userId, status: "completed", completedAt: { gte: start, lt: end } },
      select: { estimatedEarningsCents: true },
    });
    const routesAccepted = await this.prisma.deliveryRoute.count({
      where: { driverId: userId, acceptedAt: { gte: start, lt: end } },
    });
    const totalCents = completed.reduce((s, r) => s + r.estimatedEarningsCents, 0);
    return {
      date: start.toISOString().slice(0, 10),
      totalCents,
      routesCompleted: completed.length,
      routesAccepted,
    };
  }

  /** Histórico de rotas do entregador (opcionalmente por status). */
  async listRoutes(userId: string, status?: string) {
    const routes = await this.prisma.deliveryRoute.findMany({
      where: {
        driverId: userId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        estimatedEarningsCents: true,
        distanceMeters: true,
        completedAt: true,
        acceptedAt: true,
        createdAt: true,
        _count: { select: { stops: true } },
      },
    });
    return routes.map((r) => ({
      id: r.id,
      status: r.status,
      estimatedEarningsCents: r.estimatedEarningsCents,
      distanceMeters: r.distanceMeters,
      stopCount: r._count.stops,
      completedAt: r.completedAt?.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

/** Janela [start, end) de um dia local (default hoje). */
function dayWindow(date?: string): { start: Date; end: Date } {
  const base = date ? new Date(`${date}T00:00:00`) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  return { start, end };
}
