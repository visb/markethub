import { Injectable, Logger } from "@nestjs/common";
import type {
  WebhookSender,
  WebhookSendInput,
  WebhookSendResult,
} from "./webhook-sender.interface";

/**
 * Envio real de webhook via fetch (story 09). Único ponto que toca a rede; o
 * resto do módulo fala só com a interface WebhookSender. Timeout curto p/ não
 * segurar o worker; falha de rede vira `ok:false` (o processor faz retry/backoff).
 */
@Injectable()
export class HttpWebhookSender implements WebhookSender {
  private readonly logger = new Logger(HttpWebhookSender.name);
  private static readonly TIMEOUT_MS = 10_000;

  async send(input: WebhookSendInput): Promise<WebhookSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HttpWebhookSender.TIMEOUT_MS);
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...input.headers },
        body: input.body,
        signal: controller.signal,
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      this.logger.warn(`Falha ao entregar webhook em ${input.url}: ${String(err)}`);
      return { ok: false, status: 0 };
    } finally {
      clearTimeout(timer);
    }
  }
}
