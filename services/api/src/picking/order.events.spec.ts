import { OrderEvents } from "./order.events";

/**
 * Story 12: OrderEvents emite order.created/order.status_changed à store room via
 * gateway, com o nome de evento que o app merchant escuta.
 */
describe("OrderEvents", () => {
  function make() {
    const emitToStore = jest.fn();
    const events = new OrderEvents({ emitToStore } as never);
    return { events, emitToStore };
  }

  it("created emite order.created à store room", () => {
    const { events, emitToStore } = make();
    events.created({ orderId: "o1", merchantId: "m1", storeId: "s1", status: "created" });
    expect(emitToStore).toHaveBeenCalledWith("s1", "order.created", {
      orderId: "o1",
      merchantId: "m1",
      storeId: "s1",
      status: "created",
    });
  });

  it("statusChanged emite order.status_changed à store room", () => {
    const { events, emitToStore } = make();
    events.statusChanged({ orderId: "o1", merchantId: "m1", storeId: "s1", status: "preparing" });
    expect(emitToStore).toHaveBeenCalledWith("s1", "order.status_changed", {
      orderId: "o1",
      merchantId: "m1",
      storeId: "s1",
      status: "preparing",
    });
  });
});
