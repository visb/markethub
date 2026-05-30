/**
 * Stub do cliente Socket.IO. Implementação real (socket.io-client) entra na Fase 5
 * (rastreio em tempo real, localização do entregador, status de picking).
 */
export interface RealtimeClient {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload: unknown): void;
}

export interface RealtimeOptions {
  url: string;
  getToken: () => string | null | Promise<string | null>;
}

export function createRealtimeClient(_opts: RealtimeOptions): RealtimeClient {
  throw new Error("RealtimeClient not implemented yet — planned for Phase 5");
}
