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
  await seedMarketplaceCategories();
  await seedExampleUsers(passwordHash);
}

// Departamentos curados (aparecem no marketplace) — nome, ícone, ordem.
const CURATED = [
  { name: "Hortifruti", icon: "🥬", order: 1 },
  { name: "Padaria", icon: "🥖", order: 2 },
  { name: "Açougue", icon: "🥩", order: 3 },
  { name: "Bebidas", icon: "🥤", order: 4 },
  { name: "Mercearia", icon: "🛒", order: 5 },
] as const;

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

// Categorias curadas + mapeia a categoria crua de mesmo nome para a curada.
async function seedMarketplaceCategories(): Promise<void> {
  for (const c of CURATED) {
    const slug = slugify(c.name);
    const mkt = await prisma.marketplaceCategory.upsert({
      where: { slug },
      update: { icon: c.icon, displayOrder: c.order },
      create: { name: c.name, slug, icon: c.icon, displayOrder: c.order, visible: true },
    });
    // Liga a categoria crua homônima (se existir) à curada.
    await prisma.category.updateMany({
      where: { slug },
      data: { marketplaceCategoryId: mkt.id },
    });
  }
  console.log(`Marketplace categories ok: ${CURATED.length} curadas.`);
}

// Usuários de exemplo: 1 merchant-manager + 1 separador (Europa), 1 cliente, 1 entregador.
async function seedExampleUsers(passwordHash: string): Promise<void> {
  const europa = await prisma.merchant.findUnique({ where: { slug: "supermercado-europa" } });
  const store = europa ? await prisma.store.findFirst({ where: { merchantId: europa.id } }) : null;

  const upsertUser = async (email: string, name: string, role: RoleName) => {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        passwordHash,
        roles: { create: [{ role: { connect: { name: role } } }] },
      },
    });
  };

  await upsertUser("cliente@markethub.local", "Cliente Exemplo", "customer");
  await upsertUser("entregador@markethub.local", "Entregador Exemplo", "driver");
  const manager = await upsertUser("gerente.europa@markethub.local", "Gerente Europa", "merchant");
  const picker = await upsertUser("separador.europa@markethub.local", "Separador Europa", "picker");

  if (store) {
    for (const [user, staffRole] of [
      [manager, "manager"],
      [picker, "picker"],
    ] as const) {
      await prisma.storeStaff.upsert({
        where: { userId_storeId_staffRole: { userId: user.id, storeId: store.id, staffRole } },
        update: {},
        create: { userId: user.id, storeId: store.id, staffRole },
      });
    }
  }
  console.log(`Example users ok (senha de todos: admin12345).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
