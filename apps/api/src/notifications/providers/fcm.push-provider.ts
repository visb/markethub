import { Logger } from "@nestjs/common";
import type {
  PushMessage,
  PushProvider,
  PushSendResult,
  PushTarget,
} from "../push-provider.interface";

/**
 * Provedor FCM (Firebase Cloud Messaging) via HTTP legacy API. APNs é alcançado
 * através do próprio FCM (sem integração direta). Tokens inválidos (NotRegistered)
 * são reportados p/ remoção.
 */
export class FcmPushProvider implements PushProvider {
  readonly name = "fcm";
  private readonly logger = new Logger("FcmPushProvider");
  private static readonly ENDPOINT = "https://fcm.googleapis.com/fcm/send";

  constructor(private readonly serverKey: string) {}

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    const invalidTokens: string[] = [];
    // FCM legacy aceita até 1000 tokens por requisição (registration_ids).
    for (const batch of chunk(targets, 1000)) {
      try {
        const res = await fetch(FcmPushProvider.ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `key=${this.serverKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            registration_ids: batch.map((t) => t.token),
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
          }),
        });
        if (!res.ok) {
          this.logger.warn(`FCM HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as { results?: { error?: string }[] };
        json.results?.forEach((r, i) => {
          if (r.error === "NotRegistered" || r.error === "InvalidRegistration") {
            const token = batch[i]?.token;
            if (token) invalidTokens.push(token);
          }
        });
      } catch (err) {
        this.logger.error(`FCM send falhou: ${(err as Error).message}`);
      }
    }
    return { invalidTokens };
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
