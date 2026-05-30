import { PrismaClient, type RoleName } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const ALL_ROLES: RoleName[] = ["customer", "picker", "driver", "merchant", "admin"];

async function main(): Promise<void> {
  // Garante que todos os papéis existem.
  for (const name of ALL_ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Usuário admin de exemplo.
  const email = "admin@markethub.local";
  const passwordHash = await argon2.hash("admin12345");
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Admin MarketHub",
      passwordHash,
      roles: {
        create: [{ role: { connect: { name: "admin" } } }],
      },
    },
  });

  console.log(`Seed ok. Admin: ${email} / admin12345`);

  await seedCatalog();
}

// Categorias canônicas (departamentos dos screenshots).
const CATEGORIES = ["Padaria", "Hortifruti", "Açougue", "Bebidas", "Mercearia"] as const;

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function seedCatalog(): Promise<void> {
  // Categorias canônicas.
  for (const name of CATEGORIES) {
    const slug = slugify(name);
    await prisma.category.upsert({ where: { slug }, update: {}, create: { name, slug } });
  }

  // Merchants + 1 loja cada.
  const merchants = [
    { name: "Supermercado Europa", city: "Curitiba", state: "PR" },
    { name: "Supermercado Condor", city: "Curitiba", state: "PR" },
  ];

  for (const m of merchants) {
    const slug = slugify(m.name);
    const connectorConfig = { baseDir: `fixtures/erp/${slug}` };
    const merchant = await prisma.merchant.upsert({
      where: { slug },
      update: { connectorType: "csv", connectorConfig },
      create: { name: m.name, slug, connectorType: "csv", connectorConfig },
    });
    await prisma.store.upsert({
      where: { merchantId_externalId: { merchantId: merchant.id, externalId: "loja-1" } },
      update: {},
      create: {
        merchantId: merchant.id,
        name: `${m.name} - Centro`,
        externalId: "loja-1",
        city: m.city,
        state: m.state,
      },
    });
  }

  // Produtos/ofertas/estoque NÃO são semeados aqui: vêm do sync ERP (conector CSV, S1.3).
  // Rode o sync para popular (POST /api/v1/erp/sync com inline:true).
  console.log(
    `Catalog seed ok: ${merchants.length} merchants + ${CATEGORIES.length} categorias. ` +
      `Produtos via sync ERP (csv).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
