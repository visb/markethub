import { Logger } from "@nestjs/common";
import type {
  PushMessage,
  PushProvider,
  PushSendResult,
  PushTarget,
} from "../push-provider.interface";

/**
 * Provedor Expo Push Service. Envia via HTTP p/ exp.host — funciona em Expo Go e
 * dev build sem projeto Firebase próprio (o Expo faz a ponte p/ FCM/APNs). Tokens
 * `ExponentPushToken[...]` são obtidos pelos apps via `getExpoPushTokenAsync`.
 *
 * Tokens reportados como `DeviceNotRegistered` no `receipt` inline são devolvidos
 * em `invalidTokens` p/ remoção. Sem SDK novo — `fetch` como no FcmPushProvider.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = "expo";
  private readonly logger = new Logger("ExpoPushProvider");
  private static readonly ENDPOINT = "https://exp.host/--/api/v2/push/send";
  /** Limite da API Expo: até 100 mensagens por requisição. */
  private static readonly BATCH_SIZE = 100;

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    const invalidTokens: string[] = [];
    for (const batch of chunk(targets, ExpoPushProvider.BATCH_SIZE)) {
      try {
        const res = await fetch(ExpoPushProvider.ENDPOINT, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            batch.map((t) => ({
              to: t.token,
              title: message.title,
              body: message.body,
              data: message.data ?? {},
            })),
          ),
        });
        if (!res.ok) {
          this.logger.warn(`Expo HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as {
          data?: { status?: string; details?: { error?: string } }[];
        };
        json.data?.forEach((ticket, i) => {
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            const token = batch[i]?.token;
            if (token) invalidTokens.push(token);
          }
        });
      } catch (err) {
        this.logger.error(`Expo send falhou: ${(err as Error).message}`);
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
