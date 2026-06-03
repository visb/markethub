/** Abstração de provedor de push. Implementações: Mock (log) e FCM (Firebase). */

export interface PushMessage {
  title: string;
  body: string;
  /** Payload de dados p/ deep-link no app (ex.: { orderId }). */
  data?: Record<string, string>;
}

export interface PushTarget {
  token: string;
  platform: "ios" | "android" | "web";
}

export interface PushSendResult {
  /** Tokens que o provedor reportou como inválidos (p/ remoção). */
  invalidTokens: string[];
}

export interface PushProvider {
  readonly name: string;
  send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult>;
}

export const PUSH_PROVIDER = Symbol("PUSH_PROVIDER");
