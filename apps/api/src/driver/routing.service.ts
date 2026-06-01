import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { computeEarnings, haversineMeters } from "./earnings.pricing";
import { ROUTE_PROVIDER, type LatLng, type RouteProvider } from "./route-provider.interface";

type StoreCoord = { id: string; latitude: number | null; longitude: number | null };
type PickupStop = { storeId: string; store: StoreCoord; groupIds: string[] };

/**
 * Motor de matching (S4.3): agrupa as separações prontas de um pedido em uma rota
 * multi-stop (coletas por loja + entrega) e estima distância/ganho. Idempotente:
 * grupo já roteado (pickupStopId != null) não entra em outra rota.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(ROUTE_PROVIDER) private readonly routes: RouteProvider,
  ) {}

  /** Constrói rotas para todos os pedidos elegíveis. Retorna nº de rotas criadas. */
  async buildPendingRoutes(): Promise<number> {
    const pending = await this.prisma.orderGroup.findMany({
      where: { status: "ready_for_pickup", pickupStopId: null },
      select: { orderId: true },
      distinct: ["orderId"],
    });
    let created = 0;
    for (const { orderId } of pending) {
      try {
        if (await this.tryBuildRouteForOrder(orderId)) created++;
      } catch (e) {
        this.logger.error(`Falha ao montar rota do pedido ${orderId}: ${String(e)}`);
      }
    }
    return created;
  }

  /** Cria 1 rota para o pedido se todos os grupos estão prontos e nenhum já roteado. */
  async tryBuildRouteForOrder(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { groups: { include: { store: true } } },
    });
    if (!order || order.groups.length === 0) return false;
    // Todos os grupos prontos e não roteados (espera as lojas mais lentas).
    const ready = order.groups.every(
      (g) => g.status === "ready_for_pickup" && g.pickupStopId == null,
    );
    if (!ready) return false;
    // Respeita a janela de agendamento (S2.5): só despacha a partir de scheduledFrom.
    if (order.scheduledFrom && order.scheduledFrom.getTime() > Date.now()) return false;

    // Paradas de coleta agrupadas por loja.
    const byStore = new Map<string, PickupStop>();
    for (const g of order.groups) {
      const cur = byStore.get(g.storeId);
      if (cur) cur.groupIds.push(g.id);
      else byStore.set(g.storeId, { storeId: g.storeId, store: g.store, groupIds: [g.id] });
    }

    const dropoff = (order.addressSnapshot ?? null) as { latitude?: number | null; longitude?: number | null } | null;
    const dropCoord = { lat: dropoff?.latitude ?? null, lng: dropoff?.longitude ?? null };

    // Ordena as coletas por vizinho mais próximo da entrega (heurística simples).
    const ordered = this.orderStops([...byStore.values()], dropCoord);

    const points: LatLng[] = [
      ...ordered.map((s) => ({ lat: s.store.latitude, lng: s.store.longitude })),
      dropCoord,
    ];
    const { distanceMeters } = await this.routes.estimate(points);
    const stopCount = ordered.length + 1;
    const estimatedEarningsCents = computeEarnings(distanceMeters, stopCount, {
      baseCents: this.config.get("DELIVERY_BASE_CENTS", { infer: true }),
      perKmCents: this.config.get("DELIVERY_PER_KM_CENTS", { infer: true }),
      perStopCents: this.config.get("DELIVERY_PER_STOP_CENTS", { infer: true }),
    });

    const ttl = this.config.get("OFFER_TTL_SECONDS", { infer: true });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const route = await tx.deliveryRoute.create({
        data: {
          status: "offered",
          estimatedEarningsCents,
          distanceMeters,
          offeredAt: now,
          offerExpiresAt: new Date(now.getTime() + ttl * 1000),
        },
      });
      let seq = 1;
      for (const s of ordered) {
        const stop = await tx.routeStop.create({
          data: { routeId: route.id, sequence: seq++, type: "pickup", storeId: s.storeId },
        });
        // guarda pickupStopId: null garante idempotência sob corrida
        await tx.orderGroup.updateMany({
          where: { id: { in: s.groupIds }, pickupStopId: null },
          data: { pickupStopId: stop.id },
        });
      }
      await tx.routeStop.create({
        data: { routeId: route.id, sequence: seq++, type: "dropoff", orderId },
      });
    });
    this.logger.log(`Rota criada p/ pedido ${orderId}: ${stopCount} paradas, ${distanceMeters}m`);
    return true;
  }

  /** Heurística vizinho-mais-próximo: ordena as coletas partindo da mais distante da
   *  entrega (coleta primeiro o que está longe). Sem coordenadas, mantém a ordem. */
  private orderStops(stops: PickupStop[], dropoff: { lat: number | null; lng: number | null }): PickupStop[] {
    if (dropoff.lat == null || dropoff.lng == null) return stops;
    const drop = { lat: dropoff.lat, lng: dropoff.lng };
    return [...stops].sort((a, b) => {
      const da = coordOf(a) ? haversineMeters(coordOf(a)!, drop) : 0;
      const db = coordOf(b) ? haversineMeters(coordOf(b)!, drop) : 0;
      return db - da; // mais distante da entrega primeiro
    });
  }
}

function coordOf(s: PickupStop): { lat: number; lng: number } | null {
  return s.store.latitude != null && s.store.longitude != null
    ? { lat: s.store.latitude, lng: s.store.longitude }
    : null;
}
