import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { ROUTE_INCLUDE, toRouteDto } from "./delivery.mapper";
import { DeliveryEvents } from "./delivery.events";
import { DriverService } from "./driver.service";
import { haversineMeters } from "./earnings.pricing";

/**
 * Oferta de rota e aceite/recusa (S4.4). Direciona cada rota ofertada ao
 * entregador disponível mais próximo da 1ª coleta, com janela de decisão
 * (offerExpiresAt). Expiração e recusa reofertam a outro; quem recusou não
 * recebe de novo (rejectedBy).
 */
@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: DriverService,
    private readonly events: DeliveryEvents,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Oferta corrente direcionada ao entregador (não expirada). */
  async currentOffer(userId: string) {
    const route = await this.prisma.deliveryRoute.findFirst({
      where: {
        offeredToDriverId: userId,
        status: "offered",
        offerExpiresAt: { gt: new Date() },
      },
      include: ROUTE_INCLUDE,
    });
    return route ? toRouteDto(route) : null;
  }

  /** Aceite com lock otimista: offered+direcionada+não expirada → accepted. */
  async accept(userId: string, routeId: string) {
    const now = new Date();
    const { count } = await this.prisma.deliveryRoute.updateMany({
      where: {
        id: routeId,
        status: "offered",
        offeredToDriverId: userId,
        offerExpiresAt: { gt: now },
      },
      data: { status: "accepted", driverId: userId, acceptedAt: now, offeredToDriverId: null },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: "OFFER_UNAVAILABLE",
        message: "Oferta expirada ou já atribuída",
      });
    }
    await this.prisma.driverProfile.update({
      where: { userId },
      data: { status: "on_route" },
    });
    this.events.routeAccepted({ routeId, driverId: userId });
    const route = await this.prisma.deliveryRoute.findUniqueOrThrow({
      where: { id: routeId },
      include: ROUTE_INCLUDE,
    });
    return toRouteDto(route);
  }

  /** Recusa: marca rejectedBy, libera o alvo e reoferta. */
  async reject(userId: string, routeId: string) {
    const route = await this.prisma.deliveryRoute.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundException({ code: "ROUTE_NOT_FOUND", message: "Rota não encontrada" });
    if (route.offeredToDriverId !== userId || route.status !== "offered") {
      throw new BadRequestException({ code: "NOT_OFFERED_TO_YOU", message: "Oferta não é sua" });
    }
    await this.prisma.deliveryRoute.update({
      where: { id: routeId },
      data: { rejectedBy: { push: userId }, offeredToDriverId: null },
    });
    await this.assignOffers();
    return { rejected: true };
  }

  /**
   * Atribui ofertas: expira alvos vencidos (vira recusa implícita), depois
   * direciona cada rota livre ao disponível mais próximo da 1ª coleta. Idempotente.
   */
  async assignOffers(): Promise<number> {
    const now = new Date();
    const routes = await this.prisma.deliveryRoute.findMany({
      where: { status: "offered" },
      include: {
        stops: {
          where: { type: "pickup" },
          orderBy: { sequence: "asc" },
          take: 1,
          include: { store: { select: { latitude: true, longitude: true } } },
        },
      },
    });

    // Expira ofertas vencidas (reoferta automática).
    for (const r of routes) {
      if (r.offeredToDriverId && r.offerExpiresAt && r.offerExpiresAt <= now) {
        await this.prisma.deliveryRoute.update({
          where: { id: r.id },
          data: { rejectedBy: { push: r.offeredToDriverId }, offeredToDriverId: null },
        });
        r.rejectedBy = [...r.rejectedBy, r.offeredToDriverId];
        r.offeredToDriverId = null;
      }
    }

    const available = await this.drivers.listAvailable();
    // Entregadores com oferta válida em aberto não recebem outra.
    const busy = new Set(
      routes
        .filter((r) => r.offeredToDriverId && r.offerExpiresAt && r.offerExpiresAt > now)
        .map((r) => r.offeredToDriverId as string),
    );
    const ttlMs = this.config.get("OFFER_TTL_SECONDS", { infer: true }) * 1000;

    let assigned = 0;
    for (const r of routes) {
      if (r.offeredToDriverId) continue; // já direcionada e válida
      const store = r.stops[0]?.store;
      const cand = available.filter((d) => !r.rejectedBy.includes(d.userId) && !busy.has(d.userId));
      if (cand.length === 0) continue; // volta ao pool; tenta no próximo ciclo
      const best = nearestDriver(cand, store);
      const expires = new Date(Date.now() + ttlMs);
      const { count } = await this.prisma.deliveryRoute.updateMany({
        where: { id: r.id, status: "offered", offeredToDriverId: null },
        data: { offeredToDriverId: best.userId, offeredAt: new Date(), offerExpiresAt: expires },
      });
      if (count > 0) {
        busy.add(best.userId);
        assigned++;
        this.events.routeOffered({ routeId: r.id, driverId: best.userId });
      }
    }
    return assigned;
  }
}

type DriverLike = { userId: string; currentLat: number | null; currentLng: number | null };

function nearestDriver(
  drivers: DriverLike[],
  store: { latitude: number | null; longitude: number | null } | null | undefined,
): DriverLike {
  if (!store || store.latitude == null || store.longitude == null) return drivers[0];
  const target = { lat: store.latitude, lng: store.longitude };
  return [...drivers].sort((a, b) => dist(a, target) - dist(b, target))[0];
}

function dist(d: DriverLike, t: { lat: number; lng: number }): number {
  if (d.currentLat == null || d.currentLng == null) return Number.POSITIVE_INFINITY;
  return haversineMeters({ lat: d.currentLat, lng: d.currentLng }, t);
}
