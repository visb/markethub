/**
 * Cliente Socket.IO compartilhado (realtime). Conecta a um namespace (default
 * `/picking`) com o JWT no handshake (`auth.token`) — mesmo contrato dos
 * gateways. Usado pelo rastreio de pedido em tempo real (S5.1 / story 02) e pelo
 * rastreio de entrega ao vivo no namespace `/delivery` (story 51).
 */
import { io, type Socket } from "socket.io-client";
import {
  PICKING_NAMESPACE,
  DELIVERY_NAMESPACE,
  DRIVER_LOCATION_EVENT,
  ORDER_UPDATED_EVENT,
  PICK_TASK_UPDATED_EVENT,
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
} from "@markethub/types";

export interface RealtimeClient {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload: unknown): void;
  /** Entra no canal de rastreio de um pedido (`order:<orderId>`). */
  subscribeOrder(orderId: string): void;
  /** Entra no stream de tarefas de uma loja (`store:<storeId>`) — staff/loja. */
  subscribeStore(storeId: string): void;
  /** `true` enquanto o socket estiver conectado. */
  readonly connected: boolean;
}

export interface RealtimeOptions {
  url: string;
  getToken: () => string | null | Promise<string | null>;
  /** Namespace Socket.IO. Default `/picking` (compat com consumidores atuais). */
  namespace?: string;
}

export function createRealtimeClient(opts: RealtimeOptions): RealtimeClient {
  let socket: Socket | null = null;
  const namespace = opts.namespace ?? PICKING_NAMESPACE;
  // Handlers registrados antes do connect são reaplicados ao socket criado.
  const handlers = new Map<string, Set<(payload: unknown) => void>>();

  function getSocket(): Socket {
    if (socket) return socket;
    socket = io(`${opts.url}${namespace}`, {
      // Token resolvido a cada (re)conexão — suporta getToken sync ou async.
      auth: (cb: (data: { token: string | null }) => void) => {
        void Promise.resolve(opts.getToken()).then((token) => cb({ token }));
      },
      autoConnect: false,
      transports: ["websocket"],
    });
    for (const [event, set] of handlers) {
      for (const handler of set) socket.on(event, handler);
    }
    return socket;
  }

  return {
    get connected() {
      return socket?.connected ?? false;
    },
    connect() {
      getSocket().connect();
    },
    disconnect() {
      socket?.disconnect();
      socket = null;
    },
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler);
      socket?.on(event, handler);
    },
    emit(event, payload) {
      getSocket().emit(event, payload);
    },
    subscribeOrder(orderId: string) {
      getSocket().emit("subscribe:order", { orderId });
    },
    subscribeStore(storeId: string) {
      getSocket().emit("subscribe:store", { storeId });
    },
  };
}

/** Reexporta os nomes de evento para os consumidores não duplicarem o literal. */
export {
  ORDER_UPDATED_EVENT,
  PICK_TASK_UPDATED_EVENT,
  ORDER_CREATED_EVENT,
  ORDER_STATUS_CHANGED_EVENT,
  DELIVERY_NAMESPACE,
  DRIVER_LOCATION_EVENT,
};
