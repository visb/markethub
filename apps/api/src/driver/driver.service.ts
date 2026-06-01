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
}
