import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";

/** Mesmo prefixo global usado em produção (main.ts). */
export const API_PREFIX = "api/v1";

/**
 * Sobe a app NestJS real para e2e, replicando o pipeline do main.ts
 * (prefixo global + ValidationPipe). Logger desligado para ruído zero.
 * Lembre de `await app.close()` no afterAll.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}
