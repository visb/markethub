import { AdminReviewsController } from "./admin-reviews.controller";
import type { ReviewsModerationService } from "../reviews";

/**
 * Story 68: controller fino da moderação — valida só o parse dos filtros e o
 * roteamento (hide com o id do admin logado; unhide idempotente no service).
 */

function makeController() {
  const moderation = {
    list: jest.fn().mockResolvedValue([]),
    hide: jest.fn().mockResolvedValue({ hidden: true }),
    unhide: jest.fn().mockResolvedValue({ hidden: false }),
  } as unknown as ReviewsModerationService;
  return { ctrl: new AdminReviewsController(moderation), moderation };
}

const admin = { id: "admin1", email: "a@a.com", roles: ["admin" as const] };

describe("AdminReviewsController", () => {
  it("list sem query delega filtros undefined", () => {
    const { ctrl, moderation } = makeController();
    ctrl.list();
    expect(moderation.list).toHaveBeenCalledWith({
      rating: undefined,
      hidden: undefined,
      merchantId: undefined,
      q: undefined,
    });
  });

  it("list parseia rating numérico e hidden booleano ('true'/'false')", () => {
    const { ctrl, moderation } = makeController();
    ctrl.list("4", "true", "m1", "ruim");
    expect(moderation.list).toHaveBeenCalledWith({
      rating: 4,
      hidden: true,
      merchantId: "m1",
      q: "ruim",
    });
    ctrl.list(undefined, "false");
    expect(moderation.list).toHaveBeenCalledWith(
      expect.objectContaining({ rating: undefined, hidden: false }),
    );
  });

  it("hidden fora de true/false vira undefined (todas)", () => {
    const { ctrl, moderation } = makeController();
    ctrl.list(undefined, "banana");
    expect(moderation.list).toHaveBeenCalledWith(expect.objectContaining({ hidden: undefined }));
  });

  it("hide delega id + admin logado + motivo", () => {
    const { ctrl, moderation } = makeController();
    ctrl.hide("r1", admin, { reason: "spam" });
    expect(moderation.hide).toHaveBeenCalledWith("r1", "admin1", "spam");
  });

  it("unhide delega o id", () => {
    const { ctrl, moderation } = makeController();
    ctrl.unhide("r1");
    expect(moderation.unhide).toHaveBeenCalledWith("r1");
  });
});
