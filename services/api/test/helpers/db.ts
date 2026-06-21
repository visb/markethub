import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/prisma/prisma.service";

export function getPrisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

/**
 * Trunca todas as tabelas do schema public (exceto as do Prisma) com
 * RESTART IDENTITY CASCADE. Usar em `beforeEach` de specs que precisam
 * de estado limpo. Só roda contra o banco de teste (ver setup-env.ts).
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}
