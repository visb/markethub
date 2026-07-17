import { CartController } from "./cart.controller";
import type { CartService } from "./cart.service";
import type { AuthUser } from "../auth";

/** Story 43: controller fino do carrinho — delega tudo ao CartService. */
function make() {
  const svc = {
    getCart: jest.fn().mockResolvedValue({ items: [] }),
    addItem: jest.fn().mockResolvedValue({ id: "i1" }),
    updateItem: jest.fn().mockResolvedValue({ id: "i1" }),
    removeItem: jest.fn().mockResolvedValue({ removed: true }),
    clear: jest.fn().mockResolvedValue({ cleared: true }),
    availableCoupons: jest.fn().mockResolvedValue([{ code: "PROMO" }]),
    applyCoupon: jest.fn().mockResolvedValue({ code: "PROMO" }),
    removeCoupon: jest.fn().mockResolvedValue({ removed: true }),
  };
  const controller = new CartController(svc as unknown as CartService);
  const user: AuthUser = { id: "u1", email: "c@x.com", roles: ["customer"] };
  return { controller, svc, user };
}

describe("CartController", () => {
  it("GET delega getCart", async () => {
    const { controller, svc, user } = make();
    await controller.get(user);
    expect(svc.getCart).toHaveBeenCalledWith("u1");
  });

  it("POST items delega addItem com dto", async () => {
    const { controller, svc, user } = make();
    await controller.add(user, { offerId: "o1", quantity: 2 });
    expect(svc.addItem).toHaveBeenCalledWith("u1", { offerId: "o1", quantity: 2 });
  });

  it("PATCH items/:id delega updateItem", async () => {
    const { controller, svc, user } = make();
    await controller.update(user, "i1", { quantity: 3 });
    expect(svc.updateItem).toHaveBeenCalledWith("u1", "i1", { quantity: 3 });
  });

  it("DELETE items/:id delega removeItem", async () => {
    const { controller, svc, user } = make();
    expect(await controller.remove(user, "i1")).toEqual({ removed: true });
    expect(svc.removeItem).toHaveBeenCalledWith("u1", "i1");
  });

  it("DELETE delega clear", async () => {
    const { controller, svc, user } = make();
    await controller.clear(user);
    expect(svc.clear).toHaveBeenCalledWith("u1");
  });

  it("GET coupons delega availableCoupons (story 74)", async () => {
    const { controller, svc, user } = make();
    expect(await controller.availableCoupons(user)).toEqual([{ code: "PROMO" }]);
    expect(svc.availableCoupons).toHaveBeenCalledWith("u1");
  });

  it("POST coupon delega applyCoupon com o code do dto", async () => {
    const { controller, svc, user } = make();
    await controller.applyCoupon(user, { code: "PROMO" });
    expect(svc.applyCoupon).toHaveBeenCalledWith("u1", "PROMO");
  });

  it("DELETE coupon delega removeCoupon", async () => {
    const { controller, svc, user } = make();
    await controller.removeCoupon(user);
    expect(svc.removeCoupon).toHaveBeenCalledWith("u1");
  });
});
