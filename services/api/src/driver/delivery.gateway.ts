import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

// Contrato espelhado de @markethub/types (delivery-events). O api não depende do
// pacote de tipos; mantenha em sincronia.
const DELIVERY_NAMESPACE = "/delivery";
const EVENT_VERSION = 1;
const DRIVER_LOCATION_EVENT = "driver:location";
// A última posição em cache expira rápido: um cliente que entra atrasado só vê o
// marcador se o entregador ainda estiver publicando (rastreio efêmero).
const LOCATION_TTL_MS = 60_000;

interface SocketUser {
  id: string;
  roles: string[];
}

export interface DeliveryLocationPayload {
  deliveryId: string;
  orderId: string;
  lat: number;
  lng: number;
  heading: number | null;
  recordedAt: string;
}

/**
 * Gateway Socket.IO do rastreio de entrega ao vivo (story 51). Namespace
 * `/delivery`, auth por JWT no handshake — mesmo contrato do PickingGateway.
 * O entregador NÃO mantém socket (publica posição via REST throttled); este
 * gateway faz o fan-out da posição na sala `order:<orderId>` para o cliente
 * dono do pedido. Guarda a última posição por pedido em memória (TTL curto)
 * para entregar a quem entra na sala atrasado. Posição não é persistida.
 */
@WebSocketGateway({ namespace: DELIVERY_NAMESPACE, cors: { origin: "*" } })
export class DeliveryGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DeliveryGateway.name);
  private readonly lastLocation = new Map<string, { payload: Record<string, unknown>; at: number }>();

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwt.verifyAsync<{ sub: string; roles: string[] }>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
      client.data.user = { id: payload.sub, roles: payload.roles ?? [] } satisfies SocketUser;
    } catch {
      client.emit("error", { code: "UNAUTHORIZED" });
      client.disconnect(true);
    }
  }

  // Rastreio ao vivo: canal por Order, só o dono (ou admin) recebe a posição.
  @SubscribeMessage("subscribe:order")
  async subscribeOrder(client: Socket, body: { orderId: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.orderId) return { ok: false, code: "BAD_REQUEST" };
    if (!(await this.canAccessOrder(user, body.orderId))) {
      return { ok: false, code: "FORBIDDEN" };
    }
    await client.join(orderRoom(body.orderId));
    // Entrega a última posição conhecida (se ainda fresca) a quem entra atrasado.
    const cached = this.lastLocation.get(body.orderId);
    if (cached && Date.now() - cached.at < LOCATION_TTL_MS) {
      client.emit(DRIVER_LOCATION_EVENT, cached.payload);
    }
    return { ok: true };
  }

  /** Fan-out da posição do entregador na sala do pedido (chamado pelo service). */
  publishLocation(orderId: string, payload: DeliveryLocationPayload): void {
    const body = { v: EVENT_VERSION, ...payload };
    this.lastLocation.set(orderId, { payload: body, at: Date.now() });
    this.server?.to(orderRoom(orderId)).emit(DRIVER_LOCATION_EVENT, body);
  }

  private async canAccessOrder(user: SocketUser, orderId: string): Promise<boolean> {
    if (user.roles.includes("admin")) return true;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    return !!order && order.userId === user.id; // só o dono
  }

  private extractToken(client: Socket): string {
    const auth = (client.handshake.auth ?? {}) as { token?: string };
    if (auth.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice(7);
    throw new Error("no token");
  }
}

const orderRoom = (orderId: string) => `order:${orderId}`;
