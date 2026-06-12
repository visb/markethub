import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";

/** Conexão BullMQ compartilhada (global). Módulos registram suas filas com registerQueue. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get("REDIS_URL", { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            ...(url.password ? { password: url.password } : {}),
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
