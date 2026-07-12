import { MerchantReviewsController } from "./merchant-reviews.controller";
import type { MerchantReviewsService } from "./merchant-reviews.service";

function makeController() {
  const list = jest.fn().mockResolvedValue([]);
  const reply = jest.fn().mockResolvedValue({ id: "r1" });
  const svc = { list, reply } as unknown as MerchantReviewsService;
  return { ctrl: new MerchantReviewsController(svc), list, reply };
}

const USER = { id: "u1", roles: ["merchant"] } as never;

describe("MerchantReviewsController", () => {
  it("list: parseia rating numérico e unanswered=true", () => {
    const { ctrl, list } = makeController();
    void ctrl.list(USER, "4", "true");
    expect(list).toHaveBeenCalledWith(
      { id: "u1", roles: ["merchant"] },
      { rating: 4, unanswered: true },
    );
  });

  it("list: rating não inteiro é ignorado; unanswered ausente = false", () => {
    const { ctrl, list } = makeController();
    void ctrl.list(USER, "abc", undefined);
    expect(list).toHaveBeenCalledWith(
      { id: "u1", roles: ["merchant"] },
      { rating: undefined, unanswered: false },
    );
  });

  it("list: unanswered=1 também conta como true", () => {
    const { ctrl, list } = makeController();
    void ctrl.list(USER, undefined, "1");
    expect(list).toHaveBeenCalledWith(
      { id: "u1", roles: ["merchant"] },
      { rating: undefined, unanswered: true },
    );
  });

  it("reply: delega texto ao service", () => {
    const { ctrl, reply } = makeController();
    void ctrl.reply(USER, "r1", { text: "obrigado" });
    expect(reply).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "r1", "obrigado");
  });
});
