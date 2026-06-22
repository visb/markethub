import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { API_PREFIX, createTestApp } from "./helpers/app";
import { authHeader, registerUser, type TestUser } from "./helpers/auth";
import { getPrisma, resetDatabase } from "./helpers/db";
import { seedOffer } from "./helpers/seed";

/**
 * Story 15: seleção de veículo pelo entregador. Lista os veículos `active` da rede
 * (merchant) da loja do entregador; seleciona/troca; rejeita veículo de outra rede
 * e inexistente; `current` reflete a última seleção e é null quando nada escolhido.
 */
describe("Driver vehicle selection (e2e)", () => {
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

  /** Entregador vinculado a uma loja com 2 veículos na rede (1 inativo) + outra rede. */
  async function setup() {
    const prisma = getPrisma(app);
    const seeded = await seedOffer(prisma);
    const driver = await registerUser(app, { roles: ["driver"] });
    const did = await userId(driver);
    await prisma.storeStaff.create({
      data: { userId: did, storeId: seeded.storeId, staffRole: "driver", active: true },
    });

    const vActive = await prisma.vehicle.create({
      data: { merchantId: seeded.merchantId, plate: "ABC1D23", type: "car", description: "Gol" },
    });
    const vInactive = await prisma.vehicle.create({
      data: { merchantId: seeded.merchantId, plate: "XYZ4E56", type: "van", active: false },
    });

    // veículo de OUTRA rede (fora do escopo do entregador)
    const other = await seedOffer(prisma);
    const vOther = await prisma.vehicle.create({
      data: { merchantId: other.merchantId, plate: "DEF2F34", type: "motorcycle" },
    });

    return { prisma, driver, did, seeded, vActive, vInactive, vOther };
  }

  it("GET /driver/vehicles lista só os active da rede do entregador", async () => {
    const ctx = await setup();
    const res = await request(app.getHttpServer())
      .get(url("/driver/vehicles"))
      .set(authHeader(ctx.driver))
      .expect(200);
    const ids = (res.body as Array<{ id: string }>).map((v) => v.id);
    expect(ids).toEqual([ctx.vActive.id]); // sem o inativo, sem o de outra rede
    expect(res.body[0]).toEqual({ id: ctx.vActive.id, plate: "ABC1D23", type: "car", description: "Gol" });
  });

  it("GET /driver/vehicle/current retorna null antes de selecionar", async () => {
    const ctx = await setup();
    const res = await request(app.getHttpServer())
      .get(url("/driver/vehicle/current"))
      .set(authHeader(ctx.driver))
      .expect(200);
    expect(res.body).toEqual({}); // null serializado → corpo vazio
    expect(res.text).toBe("");
  });

  it("PUT /driver/vehicle seleciona, persiste e current reflete a escolha", async () => {
    const ctx = await setup();
    const sel = await request(app.getHttpServer())
      .put(url("/driver/vehicle"))
      .set(authHeader(ctx.driver))
      .send({ vehicleId: ctx.vActive.id })
      .expect(200);
    expect(sel.body).toMatchObject({ id: ctx.vActive.id, plate: "ABC1D23" });

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: ctx.did } });
    expect(user.activeVehicleId).toBe(ctx.vActive.id);

    const cur = await request(app.getHttpServer())
      .get(url("/driver/vehicle/current"))
      .set(authHeader(ctx.driver))
      .expect(200);
    expect(cur.body).toMatchObject({ id: ctx.vActive.id, type: "car" });
  });

  it("PUT /driver/vehicle troca para outro veículo da rede", async () => {
    const ctx = await setup();
    const v2 = await ctx.prisma.vehicle.create({
      data: { merchantId: ctx.seeded.merchantId, plate: "GHI3G45", type: "motorcycle" },
    });
    await request(app.getHttpServer())
      .put(url("/driver/vehicle"))
      .set(authHeader(ctx.driver))
      .send({ vehicleId: ctx.vActive.id })
      .expect(200);
    const swap = await request(app.getHttpServer())
      .put(url("/driver/vehicle"))
      .set(authHeader(ctx.driver))
      .send({ vehicleId: v2.id })
      .expect(200);
    expect(swap.body.id).toBe(v2.id);
  });

  it("PUT /driver/vehicle rejeita veículo de outra rede → VEHICLE_NOT_AVAILABLE", async () => {
    const ctx = await setup();
    const res = await request(app.getHttpServer())
      .put(url("/driver/vehicle"))
      .set(authHeader(ctx.driver))
      .send({ vehicleId: ctx.vOther.id })
      .expect(403);
    expect(res.body.code).toBe("VEHICLE_NOT_AVAILABLE");
  });

  it("PUT /driver/vehicle rejeita veículo inativo da própria rede → VEHICLE_NOT_AVAILABLE", async () => {
    const ctx = await setup();
    const res = await request(app.getHttpServer())
      .put(url("/driver/vehicle"))
      .set(authHeader(ctx.driver))
      .send({ vehicleId: ctx.vInactive.id })
      .expect(403);
    expect(res.body.code).toBe("VEHICLE_NOT_AVAILABLE");
  });

  it("PUT /driver/vehicle rejeita veículo inexistente → VEHICLE_NOT_FOUND", async () => {
    const ctx = await setup();
    const res = await request(app.getHttpServer())
      .put(url("/driver/vehicle"))
      .set(authHeader(ctx.driver))
      .send({ vehicleId: "naoexiste" })
      .expect(404);
    expect(res.body.code).toBe("VEHICLE_NOT_FOUND");
  });

  it("401 sem autenticação", async () => {
    await request(app.getHttpServer()).get(url("/driver/vehicles")).expect(401);
  });
});
