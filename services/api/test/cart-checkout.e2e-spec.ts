import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";
import { waitFor } from "./helpers/wait";

/**
 * C12: carrinho multi-loja → checkout (retirada) → criação do pedido. Cobre a
 * agregação por loja, a criação transacional de Order/OrderGroup/items e a
 * limpeza do carrinho.
 */
describe("Cart → checkout (e2e)", () => {
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

  beforeEach(async () => {
    // carrinho/pedidos limpos por usuário novo a cada teste
    customer = await registerUser(app);
  });

  async function addItem(offerId: string, quantity = 1) {
    return request(app.getHttpServer())
      .post(url("/cart/items"))
      .set(authHeader(customer))
      .send({ offerId, quantity })
      .expect(201);
  }

  it("agrega itens de 2 lojas em grupos distintos", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma, { priceCents: 1000 });
    const b = await seedOffer(prisma, { priceCents: 2500 });

    await addItem(a.offerId, 2);
    await addItem(b.offerId, 1);

    const cart = await request(app.getHttpServer())
      .get(url("/cart"))
      .set(authHeader(customer))
      .expect(200);

    expect(cart.body.itemCount).toBe(2);
    expect(cart.body.groups).toHaveLength(2);
    expect(cart.body.totals.itemsCents).toBe(1000 * 2 + 2500);
  });

  it("checkout (pickup) cria pedido com 2 grupos e limpa o carrinho", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma, { priceCents: 1000 });
    const b = await seedOffer(prisma, { priceCents: 2500 });
    await addItem(a.offerId, 2);
    await addItem(b.offerId, 1);

    const order = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "pickup" })
      .expect(201);

    expect(order.body.status).toBe("created");
    expect(order.body.groups).toHaveLength(2);
    expect(order.body.itemsCents).toBe(1000 * 2 + 2500);
    expect(order.body.deliveryCode).toEqual(expect.any(String));

    // carrinho esvaziado
    const cart = await request(app.getHttpServer())
      .get(url("/cart"))
      .set(authHeader(customer))
      .expect(200);
    expect(cart.body.itemCount).toBe(0);
  });

  // Story 46: o checkout emite `order.created` NA MESMA TX (transactional
  // outbox); a cobrança PIX vira efeito assíncrono (handler gerar-cobranca-pix),
  // preservando o contrato do endpoint (detail imediato; /pay reaproveita).
  it("checkout grava order.created no outbox e a cobrança PIX nasce por handler", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma, { priceCents: 1000 });
    await addItem(a.offerId, 1);

    const order = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "pickup" })
      .expect(201);
    const orderId: string = order.body.id;

    // evento gravado atomicamente com o pedido
    const evt = await prisma.outboxEvent.findFirst({
      where: { type: "order.created", aggregateId: orderId },
    });
    expect(evt).not.toBeNull();
    expect(evt!.payload).toMatchObject({ orderId });

    // efeito assíncrono: relay + handler geram a cobrança pendente no gateway mock
    const payment = await waitFor(() => prisma.payment.findUnique({ where: { orderId } }), {
      label: "cobrança PIX do order.created",
    });
    expect(payment.status).toBe("pending");
    expect(payment.pixQrCode).toEqual(expect.any(String));

    // o endpoint /pay segue funcionando e REAPROVEITA a cobrança pendente válida
    const pay = await request(app.getHttpServer())
      .post(url(`/orders/${orderId}/pay`))
      .set(authHeader(customer))
      .expect(201);
    expect(pay.body.qrCode).toBe(payment.pixQrCode);
  });

  it("checkout com carrinho vazio → CART_EMPTY", async () => {
    const res = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "pickup" })
      .expect(400);
    expect(res.body.code).toBe("CART_EMPTY");
  });

  it("checkout de entrega sem endereço → ADDRESS_REQUIRED", async () => {
    const prisma = getPrisma(app);
    const a = await seedOffer(prisma, { priceCents: 1000 });
    await addItem(a.offerId, 1);

    const res = await request(app.getHttpServer())
      .post(url("/checkout"))
      .set(authHeader(customer))
      .send({ fulfillment: "delivery" })
      .expect(400);
    expect(res.body.code).toBe("ADDRESS_REQUIRED");
  });
});
