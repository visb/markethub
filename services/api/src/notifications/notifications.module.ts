import { BullModule } from "@nestjs/bullmq";
import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { NotificationsController } from "./notifications.controller";
import { ExpoPushProvider } from "./providers/expo.push-provider";
import { FcmPushProvider } from "./providers/fcm.push-provider";
import { MockPushProvider } from "./providers/mock.push-provider";
import { PUSH_PROVIDER, type PushProvider } from "./push-provider.interface";
import { PushProcessor } from "./push.processor";
import { PUSH_QUEUE, PushQueueService } from "./push.queue";
import { PushService } from "./push.service";

/**
 * Seleciona o provedor de push por env: `expo` → Expo Push Service; `fcm` (com
 * `FCM_SERVER_KEY`) → Firebase; caso contrário Mock (log). Exportado p/ teste.
 */
export function createPushProvider(config: ConfigService<Env, true>): PushProvider {
  const provider = config.get("PUSH_PROVIDER", { infer: true });
  const key = config.get("FCM_SERVER_KEY", { infer: true });
  const log = new Logger("NotificationsModule");
  if (provider === "expo") {
    log.log("Using Expo push provider");
    return new ExpoPushProvider();
  }
  if (provider === "fcm" && key) {
    log.log("Using FCM push provider");
    return new FcmPushProvider(key);
  }
  log.warn("Using Mock push provider");
  return new MockPushProvider();
}

/**
 * Notificações push (S5.6). Global p/ que qualquer módulo (picking/driver) possa
 * injetar PushService nos pontos de disparo. Provedor selecionado por env.
 * Story 49: envio assíncrono via fila BullMQ (conexão herdada do QueueModule).
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE })],
  controllers: [NotificationsController],
  providers: [
    PushService,
    PushQueueService,
    PushProcessor,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: createPushProvider,
    },
  ],
  exports: [PushService],
})
export class NotificationsModule {}
