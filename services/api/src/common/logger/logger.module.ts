import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { Env } from "../../config/env";

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get("NODE_ENV", { infer: true }) === "development";
        return {
          pinoHttp: {
            level: config.get("LOG_LEVEL", { infer: true }),
            genReqId: (req, res) => {
              const existing = req.headers["x-request-id"];
              const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
              res.setHeader("x-request-id", id);
              return id;
            },
            autoLogging: true,
            transport: isDev
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
