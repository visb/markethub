import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";

/**
 * C13: cobrança PIX e webhook do gateway (provider mock). pay cria a cobrança
 * pendente; o webhook paid marca o pagamento e leva o pedido a preparing
 * (markPaid). Idempotência do webhook coberta.
 */
describe("Payment PIX (e2e)", () => {
  let app: INestApplication;
  let customer: TestUser;
  const url = (p: string) => `/${API_PREFIX}${p}`;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(getPrisma(app));
  });

  afterAll(async () => {
    await app.close();
  });

  async function createOrder(): Promise<string> {
    customer = await registerUser(app);
    const offer = await seedOffer(getPrisma(app), { priceCents: 3000 });
    await request(app.getHttpServer())
      .post(url("/cart/items"))
      .set(authHeader(customer))
      .send({ offerId: offer.offerId, quantity: 1 })
      .expect(201);
    const order = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "pickup" })
      .expect(201);
    return order.body.id;
  }

  it("pay cria cobrança PIX pendente com QR code", async () => {
    const orderId = await createOrder();
    const res = await request(app.getHttpServer())
      .post(url(`/orders/${orderId}/pay`))
      .set(authHeader(customer))
      .expect(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.qrCode).toEqual(expect.any(String));
  });

  it("webhook paid → pagamento paid e pedido em preparing", async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(url(`/orders/${orderId}/pay`))
      .set(authHeader(customer))
      .expect(201);

    const payment = await getPrisma(app).payment.findFirstOrThrow({ where: { orderId } });

    const hook = await request(app.getHttpServer())
      .post(url("/webhooks/pix"))
      .send({ chargeId: payment.providerChargeId, status: "paid" })
      .expect(201);
    expect(hook.body).toEqual({ handled: true });

    const status = await request(app.getHttpServer())
      .get(url(`/orders/${orderId}/payment`))
      .set(authHeader(customer))
      .expect(200);
    expect(status.body.status).toBe("paid");

    const order = await getPrisma(app).order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("preparing");
  });

  it("webhook é idempotente: segundo paid não quebra nem regride o estado", async () => {
    const orderId = await createOrder();
    await request(app.getHttpServer())
      .post(url(`/orders/${orderId}/pay`))
      .set(authHeader(customer))
      .expect(201);
    const payment = await getPrisma(app).payment.findFirstOrThrow({ where: { orderId } });
    const body = { chargeId: payment.providerChargeId, status: "paid" };

    await request(app.getHttpServer()).post(url("/webhooks/pix")).send(body).expect(201);
    const second = await request(app.getHttpServer())
      .post(url("/webhooks/pix"))
      .send(body)
      .expect(201);
    expect(second.body).toEqual({ handled: true });

    const order = await getPrisma(app).order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("preparing");
  });

  it("webhook com chargeId desconhecido → handled false", async () => {
    const res = await request(app.getHttpServer())
      .post(url("/webhooks/pix"))
      .send({ chargeId: "inexistente", status: "paid" })
      .expect(201);
    expect(res.body).toEqual({ handled: false });
  });
});
