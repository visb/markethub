/**
 * Contrato de envio HTTP de webhook (story 09). O disparo real (POST na URL do
 * merchant) é uma dependência externa — fica atrás desta interface para ser
 * mockada nos testes (NUNCA chamar URL real em teste). Implementação concreta:
 * HttpWebhookSender; nos testes usamos um mock.
 */
export interface WebhookSendInput {
  url: string;
  /** Corpo já serializado (assinado byte-a-byte com este mesmo string). */
  body: string;
  headers: Record<string, string>;
}

export interface WebhookSendResult {
  ok: boolean;
  status: number;
}

export interface WebhookSender {
  send(input: WebhookSendInput): Promise<WebhookSendResult>;
}

/** Token DI para a implementação de envio de webhook. */
export const WEBHOOK_SENDER = Symbol("WEBHOOK_SENDER");
