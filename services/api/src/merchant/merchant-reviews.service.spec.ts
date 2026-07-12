import { ForbiddenException } from "@nestjs/common";
import { MerchantReviewsService } from "./merchant-reviews.service";
import type { MerchantService } from "./merchant.service";
import type { ReviewsManagementService } from "../reviews";

function makeService(opts: {
  level?: "owner" | "admin" | "manager";
  merchantIds?: string[];
} = {}) {
  const merchant = {
    resolveLevel: jest.fn().mockResolvedValue(opts.level ?? "owner"),
    scopedStores: jest.fn().mockResolvedValue({ storeIds: [], merchantIds: opts.merchantIds ?? ["m1"] }),
  } as unknown as MerchantService;
  const reviews = {
    listForManagement: jest.fn().mockResolvedValue([{ id: "r1", merchantId: "m1" }]),
    reply: jest.fn().mockResolvedValue({ id: "r1", replyText: "ok", merchantId: "m1" }),
  } as unknown as ReviewsManagementService;
  return { svc: new MerchantReviewsService(merchant, reviews), merchant, reviews };
}

const USER = { id: "u1", roles: ["merchant"] };

describe("MerchantReviewsService — capability reviews.manage", () => {
  it("manager (gerente) → FORBIDDEN ao listar", async () => {
    const { svc } = makeService({ level: "manager" });
    await expect(svc.list(USER, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("manager → FORBIDDEN ao responder (REVIEWS_FORBIDDEN)", async () => {
    const { svc } = makeService({ level: "manager" });
    await expect(svc.reply(USER, "r1", "oi")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REVIEWS_FORBIDDEN" }),
    });
  });

  it("admin lista as avaliações das redes do escopo com filtros", async () => {
    const { svc, reviews } = makeService({ level: "admin", merchantIds: ["m1", "m2"] });
    const res = await svc.list(USER, { rating: 5, unanswered: true });
    expect(reviews.listForManagement).toHaveBeenCalledWith(["m1", "m2"], {
      rating: 5,
      unanswered: true,
    });
    expect(res).toHaveLength(1);
  });

  it("owner responde delegando com merchantIds do escopo", async () => {
    const { svc, reviews } = makeService({ level: "owner", merchantIds: ["m1"] });
    const res = await svc.reply(USER, "r1", "obrigado");
    expect(reviews.reply).toHaveBeenCalledWith(["m1"], "r1", "obrigado");
    expect(res).toMatchObject({ id: "r1", replyText: "ok" });
  });
});
