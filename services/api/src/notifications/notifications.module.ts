import { BullModule } from "@nestjs/bullmq";
import { Global, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { NotificationsController } from "./notifications.controller";
import { FcmPushProvider } from "./providers/fcm.push-provider";
import { MockPushProvider } from "./providers/mock.push-provider";
import { PUSH_PROVIDER } from "./push-provider.interface";
import { PushProcessor } from "./push.processor";
import { PUSH_QUEUE, PushQueueService } from "./push.queue";
import { PushService } from "./push.service";

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
      useFactory: (config: ConfigService<Env, true>) => {
        const provider = config.get("PUSH_PROVIDER", { infer: true });
        const key = config.get("FCM_SERVER_KEY", { infer: true });
        const log = new Logger("NotificationsModule");
        if (provider === "fcm" && key) {
          log.log("Using FCM push provider");
          return new FcmPushProvider(key);
        }
        log.warn("Using Mock push provider");
        return new MockPushProvider();
      },
    },
  ],
  exports: [PushService],
})
export class NotificationsModule {}
