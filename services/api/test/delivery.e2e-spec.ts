import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";

/**
 * C15: entrega própria ponta a ponta. Pedido de entrega separado e marcado
 * pronto gera Delivery (unassigned); a loja atribui um entregador, que coleta
 * (pickupCode) e entrega (deliveryCode), levando o pedido a delivered.
 */
describe("Delivery (e2e)", () => {
  let app: INestApplication;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  async function userId(u: TestUser): Promise<string> {
    return (await getPrisma(app).user.findFirstOrThrow({ where: { email: u.email } })).id;
  }

  /** Leva um pedido de entrega até "ready" (Delivery criada) e devolve os ids/códigos. */
  async function setupReadyDelivery() {
    const prisma = getPrisma(app);
    const customer = await registerUser(app);
    const cid = await userId(customer);
    const seeded = await seedOffer(prisma, { priceCents: 2000 });
    const address = await prisma.address.create({
      data: { userId: cid, label: "Casa", street: "Rua A", number: "10", city: "Curitiba", state: "PR", zipCode: "80000-000" },
    });

    await request(app.getHttpServer())
      .post(url("/cart/items"))
      .set(authHeader(customer))
      .send({ offerId: seeded.offerId, quantity: 1 })
      .expect(201);
    const order = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "delivery", addressId: address.id })
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

    // picker separa e marca pronto
    const picker = await registerUser(app, { roles: ["picker"] });
    const pickerId = await userId(picker);
    await prisma.storeStaff.create({
      data: { userId: pickerId, storeId: seeded.storeId, staffRole: "picker", active: true },
    });
    const task = await prisma.pickTask.findFirstOrThrow({ where: { storeId: seeded.storeId } });
    await request(app.getHttpServer()).post(url(`/pick-tasks/${task.id}/assign`)).set(authHeader(picker)).expect(201);
    await request(app.getHttpServer()).post(url(`/pick-tasks/${task.id}/start`)).set(authHeader(picker)).expect(201);
    const detail = await request(app.getHttpServer()).get(url(`/pick-tasks/${task.id}`)).set(authHeader(picker)).expect(200);
    await request(app.getHttpServer())
      .patch(url(`/pick-tasks/${task.id}/items/${detail.body.items[0].id}`))
      .set(authHeader(picker))
      .send({ action: "pick", quantityPicked: 1 })
      .expect(200);
    await request(app.getHttpServer()).post(url(`/pick-tasks/${task.id}/complete-picking`)).set(authHeader(picker)).expect(201);
    await request(app.getHttpServer()).post(url(`/pick-tasks/${task.id}/ready`)).set(authHeader(picker)).expect(201);

    const delivery = await prisma.delivery.findFirstOrThrow({ where: { storeId: seeded.storeId } });
    const group = await prisma.orderGroup.findFirstOrThrow({ where: { id: delivery.orderGroupId } });
    const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    return {
      prisma,
      picker,
      orderId,
      storeId: seeded.storeId,
      deliveryId: delivery.id,
      pickupCode: group.pickupCode as string,
      deliveryCode: orderRow.deliveryCode as string,
    };
  }

  it("fluxo completo: atribui → coleta → entrega → pedido delivered", async () => {
    const ctx = await setupReadyDelivery();
    const driver = await registerUser(app, { roles: ["driver"] });
    const driverId = await userId(driver);
    await ctx.prisma.storeStaff.create({
      data: { userId: driverId, storeId: ctx.storeId, staffRole: "driver", active: true },
    });

    // loja (picker) atribui a entrega ao entregador
    const assigned = await request(app.getHttpServer())
      .post(url(`/store/deliveries/${ctx.deliveryId}/assign`))
      .set(authHeader(ctx.picker))
      .send({ driverId })
      .expect(201);
    expect(assigned.body.status).toBe("assigned");

    // entregador coleta
    const pickedUp = await request(app.getHttpServer())
      .post(url(`/driver/deliveries/${ctx.deliveryId}/pickup`))
      .set(authHeader(driver))
      .send({ pickupCode: ctx.pickupCode })
      .expect(201);
    expect(pickedUp.body.status).toBe("picked_up");

    // entregador entrega
    const delivered = await request(app.getHttpServer())
      .post(url(`/driver/deliveries/${ctx.deliveryId}/deliver`))
      .set(authHeader(driver))
      .send({ deliveryCode: ctx.deliveryCode })
      .expect(201);
    expect(delivered.body.status).toBe("delivered");

    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: ctx.orderId } });
    expect(order.status).toBe("delivered");
  });

  it("atribuir a quem não é entregador da loja → NOT_STORE_DRIVER", async () => {
    const ctx = await setupReadyDelivery();
    const stranger = await registerUser(app, { roles: ["driver"] });
    const strangerId = await userId(stranger);
    const res = await request(app.getHttpServer())
      .post(url(`/store/deliveries/${ctx.deliveryId}/assign`))
      .set(authHeader(ctx.picker))
      .send({ driverId: strangerId })
      .expect(400);
    expect(res.body.code).toBe("NOT_STORE_DRIVER");
  });

  it("entregar antes de coletar → DELIVERY_NOT_PICKED_UP", async () => {
    const ctx = await setupReadyDelivery();
    const driver = await registerUser(app, { roles: ["driver"] });
    const driverId = await userId(driver);
    await ctx.prisma.storeStaff.create({
      data: { userId: driverId, storeId: ctx.storeId, staffRole: "driver", active: true },
    });
    await request(app.getHttpServer())
      .post(url(`/store/deliveries/${ctx.deliveryId}/assign`))
      .set(authHeader(ctx.picker))
      .send({ driverId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(url(`/driver/deliveries/${ctx.deliveryId}/deliver`))
      .set(authHeader(driver))
      .send({ deliveryCode: ctx.deliveryCode })
      .expect(400);
    expect(res.body.code).toBe("DELIVERY_NOT_PICKED_UP");
  });
});
