import { ReviewsController } from "./reviews.controller";
import type { ReviewsService } from "./reviews.service";
import type { TipsService } from "./tips.service";
import type { AuthUser } from "../auth";

/**
 * Backfill de cobertura (story 28). Controller fino: roteamento de avaliações
 * e gorjetas, repassando user/orderId/dto aos services. Caminho feliz.
 */

const USER = { id: "u1" } as AuthUser;

function makeController() {
  const reviews = {
    listForOrder: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "r1" }),
  } as unknown as ReviewsService;
  const tips = {
    get: jest.fn().mockResolvedValue(null),
    targets: jest.fn().mockResolvedValue({ merchants: [] }),
    create: jest.fn().mockResolvedValue({ id: "t1" }),
    mockPay: jest.fn().mockResolvedValue({ status: "paid" }),
  } as unknown as TipsService;
  return { ctrl: new ReviewsController(reviews, tips), reviews, tips };
}

describe("ReviewsController", () => {
  it("list delega user/orderId", () => {
    const { ctrl, reviews } = makeController();
    ctrl.list(USER, "o1");
    expect(reviews.listForOrder).toHaveBeenCalledWith("u1", "o1");
  });

  it("create repassa o dto", () => {
    const { ctrl, reviews } = makeController();
    const dto = { axis: "platform" as const, rating: 5 };
    ctrl.create(USER, "o1", dto);
    expect(reviews.create).toHaveBeenCalledWith("u1", "o1", dto);
  });

  it("getTip delega", () => {
    const { ctrl, tips } = makeController();
    ctrl.getTip(USER, "o1");
    expect(tips.get).toHaveBeenCalledWith("u1", "o1");
  });

  it("tipTargets delega", () => {
    const { ctrl, tips } = makeController();
    ctrl.tipTargets(USER, "o1");
    expect(tips.targets).toHaveBeenCalledWith("u1", "o1");
  });

  it("createTip repassa os itens", () => {
    const { ctrl, tips } = makeController();
    const items = [{ target: "platform" as const, amountCents: 500 }];
    ctrl.createTip(USER, "o1", { items });
    expect(tips.create).toHaveBeenCalledWith("u1", "o1", items);
  });

  it("mockPayTip delega", () => {
    const { ctrl, tips } = makeController();
    ctrl.mockPayTip(USER, "o1");
    expect(tips.mockPay).toHaveBeenCalledWith("u1", "o1");
  });
});
