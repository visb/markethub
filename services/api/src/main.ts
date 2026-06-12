import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const prefix = config.get("API_PREFIX", { infer: true });
  const corsOrigins = config.get("CORS_ORIGINS", { infer: true });

  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({
    origin: corsOrigins === "*" ? true : corsOrigins.split(",").map((o) => o.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  app.get(Logger).log(`API on http://localhost:${port}/${prefix}`);
}

void bootstrap();
