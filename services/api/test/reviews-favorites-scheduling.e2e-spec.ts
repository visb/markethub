import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";

/**
 * C16: favoritos (CRUD idempotente), avaliações (pedido entregue, unicidade de
 * eixo) e slots de agendamento (criação pelo manager, listagem do cliente,
 * reserva atômica no checkout consumindo capacidade).
 */
describe("Reviews + Favorites + Scheduling (e2e)", () => {
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

  describe("Favorites", () => {
    it("add → list → idempotente → remove", async () => {
      const customer = await registerUser(app);
      const offer = await seedOffer(getPrisma(app), { priceCents: 1500 });

      await request(app.getHttpServer())
        .post(url("/favorites"))
        .set(authHeader(customer))
        .send({ offerId: offer.offerId })
        .expect(201);
      // idempotente: segundo add não duplica
      await request(app.getHttpServer())
        .post(url("/favorites"))
        .set(authHeader(customer))
        .send({ offerId: offer.offerId })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get(url("/favorites"))
        .set(authHeader(customer))
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].offerId).toBe(offer.offerId);

      await request(app.getHttpServer())
        .delete(url(`/favorites/${offer.offerId}`))
        .set(authHeader(customer))
        .expect(200);
      const empty = await request(app.getHttpServer())
        .get(url("/favorites"))
        .set(authHeader(customer))
        .expect(200);
      expect(empty.body).toHaveLength(0);
    });

    it("add com oferta inexistente → OFFER_NOT_FOUND", async () => {
      const customer = await registerUser(app);
      const res = await request(app.getHttpServer())
        .post(url("/favorites"))
        .set(authHeader(customer))
        .send({ offerId: "inexistente" })
        .expect(400);
      expect(res.body.code).toBe("OFFER_NOT_FOUND");
    });
  });

  describe("Reviews", () => {
    async function deliveredOrder(customer: TestUser): Promise<string> {
      const prisma = getPrisma(app);
      const offer = await seedOffer(prisma, { priceCents: 2000 });
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
      // marca entregue para abrir a janela de avaliação
      await prisma.order.update({
        where: { id: order.body.id },
        data: { status: "delivered", updatedAt: new Date() },
      });
      return order.body.id;
    }

    it("cria review platform e impede segunda avaliação do mesmo eixo", async () => {
      const customer = await registerUser(app);
      const orderId = await deliveredOrder(customer);

      await request(app.getHttpServer())
        .post(url(`/orders/${orderId}/reviews`))
        .set(authHeader(customer))
        .send({ axis: "platform", rating: 5, comment: "Ótimo" })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get(url(`/orders/${orderId}/reviews`))
        .set(authHeader(customer))
        .expect(200);
      expect(list.body).toHaveLength(1);

      const dup = await request(app.getHttpServer())
        .post(url(`/orders/${orderId}/reviews`))
        .set(authHeader(customer))
        .send({ axis: "platform", rating: 4 })
        .expect(400);
      expect(dup.body.code).toBe("ALREADY_REVIEWED");
    });

    it("nota fora de 1..5 é rejeitada (400)", async () => {
      const customer = await registerUser(app);
      const orderId = await deliveredOrder(customer);
      // DTO valida o range antes do service (INVALID_RATING coberto em unit).
      await request(app.getHttpServer())
        .post(url(`/orders/${orderId}/reviews`))
        .set(authHeader(customer))
        .send({ axis: "platform", rating: 9 })
        .expect(400);
    });
  });

  describe("Scheduling slots", () => {
    it("manager cria slot, cliente lista e o checkout reserva a capacidade", async () => {
      const prisma = getPrisma(app);
      const admin = await registerUser(app, { roles: ["admin"] });
      const customer = await registerUser(app);
      const cid = await userId(customer);
      const offer = await seedOffer(prisma, { priceCents: 2000 });
      const address = await prisma.address.create({
        data: { userId: cid, label: "Casa", street: "R", number: "1", city: "Curitiba", state: "PR", zipCode: "80000-000" },
      });

      const start = new Date(Date.now() + 86400_000);
      const end = new Date(start.getTime() + 3600_000);
      const created = await request(app.getHttpServer())
        .post(url("/store/slots"))
        .set(authHeader(admin))
        .send({ storeId: offer.storeId, start: start.toISOString(), end: end.toISOString(), capacity: 1 })
        .expect(201);
      const slotId: string = created.body.id;

      const avail = await request(app.getHttpServer())
        .get(url(`/stores/${offer.storeId}/slots`))
        .set(authHeader(customer))
        .expect(200);
      expect(avail.body.find((s: { id: string }) => s.id === slotId)).toMatchObject({ remaining: 1 });

      // reserva no checkout
      await request(app.getHttpServer())
        .post(url("/cart/items"))
        .set(authHeader(customer))
        .send({ offerId: offer.offerId, quantity: 1 })
        .expect(201);
      const order = await request(app.getHttpServer())
        .post(url("/checkout"))
        .set(authHeader(customer))
        .send({ fulfillment: "delivery", addressId: address.id, deliverySlotId: slotId })
        .expect(201);
      expect(order.body.scheduledFrom).toBeTruthy();

      // capacidade esgotada → some da lista de disponíveis
      const after = await request(app.getHttpServer())
        .get(url(`/stores/${offer.storeId}/slots`))
        .set(authHeader(customer))
        .expect(200);
      expect(after.body.find((s: { id: string }) => s.id === slotId)).toBeUndefined();

      const slot = await prisma.deliverySlot.findUniqueOrThrow({ where: { id: slotId } });
      expect(slot.reserved).toBe(1);
    });

    it("capacidade inválida é rejeitada (400)", async () => {
      const admin = await registerUser(app, { roles: ["admin"] });
      const offer = await seedOffer(getPrisma(app), { priceCents: 1000 });
      const start = new Date(Date.now() + 86400_000);
      // DTO @Min(1) valida antes do service (INVALID_CAPACITY coberto em unit).
      await request(app.getHttpServer())
        .post(url("/store/slots"))
        .set(authHeader(admin))
        .send({ storeId: offer.storeId, start: start.toISOString(), end: new Date(start.getTime() + 3600_000).toISOString(), capacity: 0 })
        .expect(400);
    });
  });
});
