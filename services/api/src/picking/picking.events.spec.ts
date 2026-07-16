import { PickingEvents } from "./picking.events";

/**
 * Story 64: a resolução da substituição (aprovar/recusar/timeout) precisa chegar
 * ao separador que propôs. `substitutionResolved` emite o evento tanto na
 * `group room` (cliente dono, rastreio) quanto na `store room` (separador).
 */
function makeEvents() {
  const gateway = {
    emitToStore: jest.fn(),
    emitToGroup: jest.fn(),
    emitToOrder: jest.fn(),
  };
  const events = new PickingEvents(gateway as never);
  return { events, gateway };
}

describe("PickingEvents.substitutionResolved (story 64)", () => {
  it("emite substitution.resolved na group room E na store room com o mesmo payload", () => {
    const { events, gateway } = makeEvents();
    events.substitutionResolved({
      id: "sub1",
      pickItemId: "i1",
      orderGroupId: "g1",
      storeId: "s1",
      approvalStatus: "approved",
    });

    const payload = {
      substitutionId: "sub1",
      orderGroupId: "g1",
      pickItemId: "i1",
      approvalStatus: "approved",
    };
    expect(gateway.emitToGroup).toHaveBeenCalledWith("g1", "substitution.resolved", payload);
    expect(gateway.emitToStore).toHaveBeenCalledWith("s1", "substitution.resolved", payload);
  });

  it("propaga o status recusado no payload dos dois canais", () => {
    const { events, gateway } = makeEvents();
    events.substitutionResolved({
      id: "sub2",
      pickItemId: "i2",
      orderGroupId: "g2",
      storeId: "s2",
      approvalStatus: "rejected",
    });
    expect(gateway.emitToGroup).toHaveBeenCalledWith(
      "g2",
      "substitution.resolved",
      expect.objectContaining({ approvalStatus: "rejected" }),
    );
    expect(gateway.emitToStore).toHaveBeenCalledWith(
      "s2",
      "substitution.resolved",
      expect.objectContaining({ approvalStatus: "rejected" }),
    );
  });
});
