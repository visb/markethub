import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";
import { waitFor } from "./helpers/wait";

/**
 * C14: sessão de separação ponta a ponta. Pedido pago gera PickTask (queued);
 * o separador assume → inicia → separa item → conclui (packed). Cobre também
 * a substituição (picker propõe, cliente aprova).
 */
describe("Picking (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cria pedido pago de 1 loja, picker staff e devolve ids úteis. */
  async function setupPaidOrder() {
    const prisma = getPrisma(app);
    const customer = await registerUser(app);
    const seeded = await seedOffer(prisma, { priceCents: 2000 });
    await request(app.getHttpServer())
      .post(url("/cart/items"))
      .set(authHeader(customer))
      .send({ offerId: seeded.offerId, quantity: 2 })
      .expect(201);
    const order = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "pickup" })
      .expect(201);
    const orderId: string = order.body.id;

    await request(app.getHttpServer())
      .post(url(`/orders/${orderId}/pay`))
      .set(authHeader(customer))
      .expect(201);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    await request(app.getHttpServer())
      .post(url("/webhooks/pix"))
      .send({ chargeId: payment.providerChargeId, status: "paid" })
      .expect(201);

    // gerar picking é handler do evento order.paid (story 45) — efeito assíncrono
    const task = await waitFor(
      () => prisma.pickTask.findFirst({ where: { storeId: seeded.storeId } }),
      { label: "PickTask do order.paid" },
    );
    const picker = await registerUser(app, { roles: ["picker"] });
    await prisma.storeStaff.create({
      data: { userId: (await prisma.user.findFirstOrThrow({ where: { email: picker.email } })).id, storeId: seeded.storeId, staffRole: "picker", active: true },
    });

    return { prisma, customer, picker, orderId, taskId: task.id, ...seeded };
  }

  it("assume → inicia → separa item → conclui (packed)", async () => {
    const { prisma, picker, orderId, taskId } = await setupPaidOrder();

    const assigned = await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/assign`))
      .set(authHeader(picker))
      .expect(201);
    expect(assigned.body.status).toBe("assigned");

    await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/start`))
      .set(authHeader(picker))
      .expect(201);

    // story 01: iniciar a separação acende "Comprando" — OrderGroup e Order → picking
    const afterStart = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { groups: { select: { status: true } } },
    });
    expect(afterStart.status).toBe("picking");
    expect(afterStart.groups.every((g) => g.status === "picking")).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(url(`/pick-tasks/${taskId}`))
      .set(authHeader(picker))
      .expect(200);
    const itemId: string = detail.body.items[0].id;

    const picked = await request(app.getHttpServer())
      .patch(url(`/pick-tasks/${taskId}/items/${itemId}`))
      .set(authHeader(picker))
      .send({ action: "pick", quantityPicked: 2 })
      .expect(200);
    expect(picked.body.status).toBe("picked");

    const done = await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/complete-picking`))
      .set(authHeader(picker))
      .expect(201);
    expect(done.body.status).toBe("packed");

    // story 01: completePicking não introduz status visível novo — segue "picking"
    const afterComplete = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(afterComplete.status).toBe("picking");
  });

  it("não-dono não consegue iniciar a tarefa de outro (NOT_TASK_OWNER)", async () => {
    const { taskId, picker } = await setupPaidOrder();
    await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/assign`))
      .set(authHeader(picker))
      .expect(201);

    const intruder = await registerUser(app, { roles: ["picker"] });
    await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/start`))
      .set(authHeader(intruder))
      .expect(403);
  });

  it("substituição: picker propõe e cliente aprova (item substituted)", async () => {
    const { prisma, picker, customer, orderId, taskId, storeId } = await setupPaidOrder();

    await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/assign`))
      .set(authHeader(picker))
      .expect(201);
    await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/start`))
      .set(authHeader(picker))
      .expect(201);

    // oferta substituta na MESMA loja
    const subProduct = await prisma.product.create({ data: { name: "Substituto", saleType: "unit" } });
    const subOffer = await prisma.offer.create({
      data: { storeId, productId: subProduct.id, priceCents: 1800, available: true },
    });

    const detail = await request(app.getHttpServer())
      .get(url(`/pick-tasks/${taskId}`))
      .set(authHeader(picker))
      .expect(200);
    const itemId: string = detail.body.items[0].id;

    const proposed = await request(app.getHttpServer())
      .post(url(`/pick-tasks/${taskId}/items/${itemId}/substitute`))
      .set(authHeader(picker))
      .send({ substituteOfferId: subOffer.id })
      .expect(201);
    const subId: string = proposed.body.id;

    await request(app.getHttpServer())
      .post(url(`/orders/${orderId}/substitutions/${subId}/approve`))
      .set(authHeader(customer))
      .expect(201);

    const pickItem = await prisma.pickItem.findFirstOrThrow({ where: { pickTaskId: taskId } });
    expect(pickItem.status).toBe("substituted");
  });
});
