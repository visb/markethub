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

// Contrato espelhado de @markethub/types (picking-events). O api não depende do
// pacote de tipos; mantenha em sincronia.
const PICKING_NAMESPACE = "/picking";
const EVENT_VERSION = 1;

interface SocketUser {
  id: string;
  roles: string[];
}

/**
 * Gateway Socket.IO da separação (S3.8). Auth por JWT no handshake; canais por
 * loja (separadores/manager/admin) e por sub-pedido (cliente dono / staff).
 * O estado atual é recuperado via REST na reconexão; eventos são best-effort.
 */
@WebSocketGateway({ namespace: PICKING_NAMESPACE, cors: { origin: "*" } })
export class PickingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(PickingGateway.name);

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

  @SubscribeMessage("subscribe:store")
  async subscribeStore(client: Socket, body: { storeId: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.storeId) return { ok: false, code: "BAD_REQUEST" };
    if (!(await this.canAccessStore(user, body.storeId))) {
      return { ok: false, code: "FORBIDDEN" };
    }
    await client.join(storeRoom(body.storeId));
    return { ok: true };
  }

  @SubscribeMessage("subscribe:group")
  async subscribeGroup(client: Socket, body: { orderGroupId: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.orderGroupId) return { ok: false, code: "BAD_REQUEST" };
    if (!(await this.canAccessGroup(user, body.orderGroupId))) {
      return { ok: false, code: "FORBIDDEN" };
    }
    await client.join(groupRoom(body.orderGroupId));
    return { ok: true };
  }

  // Rastreio do pedido (S5.1): canal por Order, só o dono (ou admin) recebe.
  @SubscribeMessage("subscribe:order")
  async subscribeOrder(client: Socket, body: { orderId: string }) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.orderId) return { ok: false, code: "BAD_REQUEST" };
    if (!(await this.canAccessOrder(user, body.orderId))) {
      return { ok: false, code: "FORBIDDEN" };
    }
    await client.join(orderRoom(body.orderId));
    return { ok: true };
  }

  // ── emit helpers (chamados por PickingEvents) ──

  emitToStore(storeId: string, event: string, payload: Record<string, unknown>): void {
    this.server?.to(storeRoom(storeId)).emit(event, { v: EVENT_VERSION, ...payload });
  }

  emitToGroup(orderGroupId: string, event: string, payload: Record<string, unknown>): void {
    this.server?.to(groupRoom(orderGroupId)).emit(event, { v: EVENT_VERSION, ...payload });
  }

  emitToOrder(orderId: string, event: string, payload: Record<string, unknown>): void {
    this.server?.to(orderRoom(orderId)).emit(event, { v: EVENT_VERSION, ...payload });
  }

  // ── autorização por canal ──

  private async canAccessStore(user: SocketUser, storeId: string): Promise<boolean> {
    if (user.roles.includes("admin")) return true;
    const staff = await this.prisma.storeStaff.findFirst({
      where: { userId: user.id, storeId, active: true },
      select: { id: true },
    });
    if (staff) return true;
    // Dono da rede (RoleName merchant) que possui a loja — app merchant (story 12).
    // MVP: posse = ter vínculo StoreStaff(manager) ativo em alguma loja da mesma rede.
    if (user.roles.includes("merchant")) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { merchantId: true },
      });
      if (!store) return false;
      const owned = await this.prisma.storeStaff.findFirst({
        where: { userId: user.id, active: true, store: { merchantId: store.merchantId } },
        select: { id: true },
      });
      return !!owned;
    }
    return false;
  }

  private async canAccessGroup(user: SocketUser, orderGroupId: string): Promise<boolean> {
    if (user.roles.includes("admin")) return true;
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      select: { storeId: true, order: { select: { userId: true } } },
    });
    if (!group) return false;
    if (group.order.userId === user.id) return true; // dono do pedido
    return this.canAccessStore(user, group.storeId); // staff da loja
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

const storeRoom = (storeId: string) => `store:${storeId}`;
const groupRoom = (orderGroupId: string) => `group:${orderGroupId}`;
const orderRoom = (orderId: string) => `order:${orderId}`;
