import { BadRequestException } from "@nestjs/common";
import { PickingController } from "./picking.controller";
import type { PickingService } from "./picking.service";
import type { PickingSessionService } from "./picking-session.service";
import type { SubstitutionService } from "./substitution.service";
import type { HandoffService } from "./handoff.service";
import type { AuthUser } from "../auth";

/**
 * Story 43: controller fino de picking — delega aos 4 services (fila/sessão/
 * substituição/handoff). Cobre também o guard de query `storeId` obrigatório.
 */
function make() {
  const picking = {
    myStores: jest.fn().mockResolvedValue([{ id: "s1" }]),
    listQueue: jest.fn().mockResolvedValue([{ id: "t1" }]),
    getTask: jest.fn().mockResolvedValue({ id: "t1" }),
    assign: jest.fn().mockResolvedValue({ id: "t1", assigned: true }),
    release: jest.fn().mockResolvedValue({ id: "t1", released: true }),
  };
  const session = {
    start: jest.fn().mockResolvedValue({ id: "t1", status: "picking" }),
    updateItem: jest.fn().mockResolvedValue({ id: "it1" }),
    completePicking: jest.fn().mockResolvedValue({ id: "t1" }),
  };
  const substitution = { propose: jest.fn().mockResolvedValue({ id: "sub1" }) };
  const handoff = {
    markReady: jest.fn().mockResolvedValue({ id: "t1", pickupCode: "1234" }),
    confirmPickup: jest.fn().mockResolvedValue({ id: "t1", status: "on_the_way" }),
  };
  const controller = new PickingController(
    picking as unknown as PickingService,
    session as unknown as PickingSessionService,
    substitution as unknown as SubstitutionService,
    handoff as unknown as HandoffService,
  );
  const user: AuthUser = { id: "u1", email: "p@x.com", roles: ["picker"] };
  return { controller, picking, session, substitution, handoff, user };
}

describe("PickingController — fila", () => {
  it("GET stores delega myStores", async () => {
    const { controller, picking, user } = make();
    await controller.stores(user);
    expect(picking.myStores).toHaveBeenCalledWith("u1");
  });

  it("GET queue com storeId delega listQueue", async () => {
    const { controller, picking, user } = make();
    await controller.queue(user, "s1");
    expect(picking.listQueue).toHaveBeenCalledWith("u1", "s1");
  });

  it("GET queue sem storeId → BadRequest STORE_ID_REQUIRED", async () => {
    const { controller, picking, user } = make();
    await expect(async () => controller.queue(user)).rejects.toBeInstanceOf(BadRequestException);
    expect(picking.listQueue).not.toHaveBeenCalled();
  });

  it("GET :id delega getTask", async () => {
    const { controller, picking, user } = make();
    await controller.detail(user, "t1");
    expect(picking.getTask).toHaveBeenCalledWith("u1", "t1");
  });

  it("POST :id/assign delega", async () => {
    const { controller, picking, user } = make();
    await controller.assign(user, "t1");
    expect(picking.assign).toHaveBeenCalledWith("u1", "t1");
  });

  it("POST :id/release delega", async () => {
    const { controller, picking, user } = make();
    await controller.release(user, "t1");
    expect(picking.release).toHaveBeenCalledWith("u1", "t1");
  });
});

describe("PickingController — sessão", () => {
  it("POST :id/start delega session.start", async () => {
    const { controller, session, user } = make();
    await controller.start(user, "t1");
    expect(session.start).toHaveBeenCalledWith("u1", "t1");
  });

  it("PATCH :id/items/:itemId delega session.updateItem com dto", async () => {
    const { controller, session, user } = make();
    await controller.updateItem(user, "t1", "it1", { action: "pick", quantityPicked: 2 });
    expect(session.updateItem).toHaveBeenCalledWith("u1", "t1", "it1", {
      action: "pick",
      quantityPicked: 2,
    });
  });

  it("POST :id/complete-picking delega", async () => {
    const { controller, session, user } = make();
    await controller.completePicking(user, "t1");
    expect(session.completePicking).toHaveBeenCalledWith("u1", "t1");
  });
});

describe("PickingController — substituição e handoff", () => {
  it("POST substitute delega só o substituteOfferId do dto", async () => {
    const { controller, substitution, user } = make();
    await controller.substitute(user, "t1", "it1", { substituteOfferId: "of2" });
    expect(substitution.propose).toHaveBeenCalledWith("u1", "t1", "it1", "of2");
  });

  it("POST :id/ready delega handoff.markReady", async () => {
    const { controller, handoff, user } = make();
    await controller.ready(user, "t1");
    expect(handoff.markReady).toHaveBeenCalledWith("u1", "t1");
  });

  it("POST :id/release-pickup delega confirmPickup com o pickupCode (sem user)", async () => {
    const { controller, handoff, user } = make();
    await controller.releasePickup(user, "t1", { pickupCode: "1234" });
    expect(handoff.confirmPickup).toHaveBeenCalledWith("t1", "1234");
  });
});
