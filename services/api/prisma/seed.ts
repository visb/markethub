import { Prisma, PrismaClient, type RoleName } from "@prisma/client";
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
  await seedDeliverySlots();
}

/** Slots de capacidade por loja (S5.3): próximos 3 dias, 2 janelas/dia. */
async function seedDeliverySlots(): Promise<void> {
  const stores = await prisma.store.findMany({ select: { id: true } });
  const windows = [
    { h0: 9, h1: 12 },
    { h0: 14, h1: 18 },
  ];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  let count = 0;
  for (const store of stores) {
    for (let day = 1; day <= 3; day++) {
      for (const w of windows) {
        const start = new Date(base);
        start.setDate(start.getDate() + day);
        start.setHours(w.h0);
        const end = new Date(start);
        end.setHours(w.h1);
        await prisma.deliverySlot.upsert({
          where: { storeId_start_end: { storeId: store.id, start, end } },
          update: { capacity: 5 },
          create: { storeId: store.id, start, end, capacity: 5 },
        });
        count++;
      }
    }
  }
  console.log(`Delivery slots ok (${count} slots).`);
}

// Departamentos curados (aparecem no marketplace) — nome, ordem e, quando faz
// sentido, a pergunta de preparo do departamento (S6.6).
const CURATED = [
  {
    name: "Hortifruti",
    order: 1,
    prepOptions: { label: "Maturação", options: ["Verde (para amadurecer)", "No ponto", "Bem maduro"] },
  },
  {
    name: "Padaria",
    order: 2,
    prepOptions: { label: "Ponto do pão", options: ["Mais clarinho", "Normal", "Bem assado"] },
  },
  {
    name: "Açougue",
    order: 3,
    prepOptions: {
      label: "Tipo de corte",
      options: ["Peça inteira", "Bifes finos", "Bifes grossos", "Em cubos", "Em tiras", "Moído"],
    },
  },
  { name: "Bebidas", order: 4, prepOptions: null },
  { name: "Mercearia", order: 5, prepOptions: null },
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

  // Merchants + 1 loja cada (coordenadas em Curitiba p/ raio e ETA em dev, S6.4/S6.7).
  const merchants = [
    { name: "Supermercado Europa", city: "Curitiba", state: "PR", latitude: -25.4284, longitude: -49.2733 },
    { name: "Supermercado Condor", city: "Curitiba", state: "PR", latitude: -25.4521, longitude: -49.2918 },
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
      update: { latitude: m.latitude, longitude: m.longitude },
      create: {
        merchantId: merchant.id,
        name: `${m.name} - Centro`,
        externalId: "loja-1",
        city: m.city,
        state: m.state,
        latitude: m.latitude,
        longitude: m.longitude,
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
    const prepOptions = c.prepOptions ?? Prisma.JsonNull;
    const mkt = await prisma.marketplaceCategory.upsert({
      where: { slug },
      update: { displayOrder: c.order, prepOptions },
      create: { name: c.name, slug, displayOrder: c.order, visible: true, prepOptions },
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
  const driver = await upsertUser("entregador@markethub.local", "Entregador Exemplo", "driver");
  const manager = await upsertUser("gerente.europa@markethub.local", "Gerente Europa", "merchant");
  const picker = await upsertUser("separador.europa@markethub.local", "Separador Europa", "picker");

  if (store) {
    for (const [user, staffRole] of [
      [manager, "manager"],
      [picker, "picker"],
      [driver, "driver"],
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
