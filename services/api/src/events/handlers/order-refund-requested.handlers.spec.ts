import { OrderRefundRequestedHandlers } from "./order-refund-requested.handlers";

/**
 * Story 67: reembolso manual do suporte como handler durável do evento
 * `order.refund_requested` — casca fina que delega ao RefundService com o
 * payload validado na emissão (teto) e o componentId de idempotência.
 */
const PAYLOAD = {
  orderId: "o1",
  groupId: "g1",
  amountCents: 2500,
  componentId: "comp1",
  createdById: "admin1",
  note: "cliente reclamou",
};

describe("OrderRefundRequestedHandlers", () => {
  it("emitirEstorno delega ao RefundService.issueManualRefund (note fica só no payload)", async () => {
    const issueManualRefund = jest.fn().mockResolvedValue(undefined);
    const handlers = new OrderRefundRequestedHandlers({ issueManualRefund } as never);

    await handlers.emitirEstorno(PAYLOAD);

    expect(issueManualRefund).toHaveBeenCalledWith({
      orderId: "o1",
      groupId: "g1",
      amountCents: 2500,
      componentId: "comp1",
      createdById: "admin1",
    });
  });

  it("createdById ausente no payload vira null", async () => {
    const issueManualRefund = jest.fn().mockResolvedValue(undefined);
    const handlers = new OrderRefundRequestedHandlers({ issueManualRefund } as never);

    await handlers.emitirEstorno({ ...PAYLOAD, createdById: null });

    expect(issueManualRefund).toHaveBeenCalledWith(expect.objectContaining({ createdById: null }));
  });

  it("falha do RefundService PROPAGA (BullMQ retenta a fila do handler)", async () => {
    const issueManualRefund = jest.fn().mockRejectedValue(new Error("gateway down"));
    const handlers = new OrderRefundRequestedHandlers({ issueManualRefund } as never);

    await expect(handlers.emitirEstorno(PAYLOAD)).rejects.toThrow("gateway down");
  });
});
