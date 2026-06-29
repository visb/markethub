import { IntegrationController } from "./integration.controller";
import type { IntegrationService } from "./integration.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * Story 43: controller fino de integração (story 09) — extrai { id, roles } do
 * usuário e delega; toda regra (owner-only) vive no IntegrationService.
 */
function make() {
  const svc = {
    connectorTypes: jest.fn().mockReturnValue(["csv"]),
    getErpConfig: jest.fn().mockResolvedValue({ connectorType: "csv" }),
    putErpConfig: jest.fn().mockResolvedValue({ connectorType: "csv" }),
    listApiKeys: jest.fn().mockResolvedValue([{ id: "k1" }]),
    createApiKey: jest.fn().mockResolvedValue({ id: "k2", secret: "s" }),
    revokeApiKey: jest.fn().mockResolvedValue({ revoked: true }),
    listWebhooks: jest.fn().mockResolvedValue([{ id: "w1" }]),
    createWebhook: jest.fn().mockResolvedValue({ id: "w2" }),
    updateWebhook: jest.fn().mockResolvedValue({ id: "w1" }),
    deleteWebhook: jest.fn().mockResolvedValue({ deleted: true }),
    testWebhook: jest.fn().mockResolvedValue({ ok: true }),
  };
  const controller = new IntegrationController(svc as unknown as IntegrationService);
  const user: AuthUser = { id: "u1", email: "m@x.com", roles: ["merchant"] };
  const identity = { id: "u1", roles: ["merchant"] };
  return { controller, svc, user, identity };
}

describe("IntegrationController — ERP", () => {
  it("GET connector-types delega (sem usuário)", () => {
    const { controller, svc } = make();
    expect(controller.connectorTypes()).toEqual(["csv"]);
    expect(svc.connectorTypes).toHaveBeenCalled();
  });

  it("GET erp passa identidade { id, roles }", async () => {
    const { controller, svc, user, identity } = make();
    await controller.getErp(user);
    expect(svc.getErpConfig).toHaveBeenCalledWith(identity);
  });

  it("PUT erp delega identidade + dto", async () => {
    const { controller, svc, user, identity } = make();
    const dto = { connectorType: "csv", connectorConfig: { url: "x" } };
    await controller.putErp(user, dto);
    expect(svc.putErpConfig).toHaveBeenCalledWith(identity, dto);
  });
});

describe("IntegrationController — api-keys", () => {
  it("GET api-keys delega", async () => {
    const { controller, svc, identity, user } = make();
    await controller.listApiKeys(user);
    expect(svc.listApiKeys).toHaveBeenCalledWith(identity);
  });

  it("POST api-keys delega só o name", async () => {
    const { controller, svc, identity, user } = make();
    await controller.createApiKey(user, { name: "CI" });
    expect(svc.createApiKey).toHaveBeenCalledWith(identity, "CI");
  });

  it("DELETE api-keys/:id delega id", async () => {
    const { controller, svc, identity, user } = make();
    await controller.revokeApiKey(user, "k1");
    expect(svc.revokeApiKey).toHaveBeenCalledWith(identity, "k1");
  });
});

describe("IntegrationController — webhooks", () => {
  it("GET webhooks delega", async () => {
    const { controller, svc, identity, user } = make();
    await controller.listWebhooks(user);
    expect(svc.listWebhooks).toHaveBeenCalledWith(identity);
  });

  it("POST webhooks delega dto", async () => {
    const { controller, svc, identity, user } = make();
    const dto = { url: "https://x", events: ["order.created"] };
    await controller.createWebhook(user, dto);
    expect(svc.createWebhook).toHaveBeenCalledWith(identity, dto);
  });

  it("PATCH webhooks/:id delega id + dto", async () => {
    const { controller, svc, identity, user } = make();
    await controller.updateWebhook(user, "w1", { active: false });
    expect(svc.updateWebhook).toHaveBeenCalledWith(identity, "w1", { active: false });
  });

  it("DELETE webhooks/:id delega id", async () => {
    const { controller, svc, identity, user } = make();
    await controller.deleteWebhook(user, "w1");
    expect(svc.deleteWebhook).toHaveBeenCalledWith(identity, "w1");
  });

  it("POST webhooks/:id/test delega id", async () => {
    const { controller, svc, identity, user } = make();
    await controller.testWebhook(user, "w1");
    expect(svc.testWebhook).toHaveBeenCalledWith(identity, "w1");
  });
});
