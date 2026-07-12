import { BadRequestException } from "@nestjs/common";
import { StoreReviewsController } from "./store-reviews.controller";
import type { ReviewsManagementService } from "./reviews-management.service";

function makeController() {
  const storeReviews = jest.fn().mockResolvedValue({ average: 4, count: 1, page: 1, pageSize: 10, items: [] });
  const svc = { storeReviews } as unknown as ReviewsManagementService;
  return { ctrl: new StoreReviewsController(svc), storeReviews };
}

describe("StoreReviewsController (vitrine pública)", () => {
  it("delega ao service com merchantId e página parseada", () => {
    const { ctrl, storeReviews } = makeController();
    void ctrl.list("m1", "merchant", "3");
    expect(storeReviews).toHaveBeenCalledWith("m1", 3);
  });

  it("page ausente → 1", () => {
    const { ctrl, storeReviews } = makeController();
    void ctrl.list("m1", "merchant", undefined);
    expect(storeReviews).toHaveBeenCalledWith("m1", 1);
  });

  it("page não numérica → 1", () => {
    const { ctrl, storeReviews } = makeController();
    void ctrl.list("m1", "merchant", "abc");
    expect(storeReviews).toHaveBeenCalledWith("m1", 1);
  });

  it("axis != merchant → 400 UNSUPPORTED_AXIS", () => {
    const { ctrl, storeReviews } = makeController();
    expect(() => ctrl.list("m1", "platform", "1")).toThrow(BadRequestException);
    expect(storeReviews).not.toHaveBeenCalled();
  });
});
