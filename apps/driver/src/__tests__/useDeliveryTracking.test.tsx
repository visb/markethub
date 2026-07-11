import React from "react";
import renderer, { act } from "react-test-renderer";
import type { DeliveryDTO } from "@markethub/api-client";
import { useDeliveryTracking } from "../hooks/useDeliveryTracking";

/**
 * Story 51: hook do ciclo de rastreio. Mocka @/tracking (start/stop), o
 * auth-context e o config. Cobre: inicia em picked_up, para no unmount, não
 * inicia fora do trânsito, sinaliza permissão negada e para no logout.
 */

const mockStart = jest.fn();
const mockStop = jest.fn();
jest.mock("@/tracking", () => ({
  startTracking: (...a: unknown[]) => mockStart(...a),
  stopTracking: (...a: unknown[]) => mockStop(...a),
}));

jest.mock("@/config", () => ({ API_URL: "http://api.test" }));

const mockUseAuth = jest.fn();
jest.mock("@/auth-context", () => ({ useAuth: () => mockUseAuth() }));

function makeDelivery(over: Partial<DeliveryDTO> = {}): DeliveryDTO {
  return {
    id: "d1",
    orderGroupId: "g1",
    orderId: "o1",
    status: "picked_up",
    storeId: "s1",
    storeName: "Loja",
    customerName: "Cliente",
    itemCount: 3,
    ...over,
  } as DeliveryDTO;
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

let last: { permissionDenied: boolean } | null = null;
function renderHook(delivery: DeliveryDTO | null | undefined) {
  function Probe() {
    last = useDeliveryTracking(delivery);
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return {
    rerender: (d: DeliveryDTO | null | undefined) =>
      act(() => {
        tree.update(<ProbeWrap d={d} />);
      }),
    unmount: () => act(() => tree.unmount()),
  };
}
function ProbeWrap({ d }: { d: DeliveryDTO | null | undefined }) {
  last = useDeliveryTracking(d);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  last = null;
  mockStart.mockResolvedValue("started");
  mockStop.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({ user: { id: "u1" } });
});

describe("useDeliveryTracking", () => {
  it("entrega picked_up: inicia o rastreio com a base /api/v1", async () => {
    renderHook(makeDelivery());
    await flush();
    expect(mockStart).toHaveBeenCalledWith({
      deliveryId: "d1",
      apiBaseUrl: "http://api.test/api/v1",
    });
  });

  it("desmontar: para o rastreio", async () => {
    const { unmount } = renderHook(makeDelivery());
    await flush();
    unmount();
    expect(mockStop).toHaveBeenCalled();
  });

  it("entrega assigned (não coletada): não inicia", async () => {
    renderHook(makeDelivery({ status: "assigned" }));
    await flush();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("sem entrega: não inicia", async () => {
    renderHook(null);
    await flush();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("permissão negada: sinaliza permissionDenied", async () => {
    mockStart.mockResolvedValue("denied");
    renderHook(makeDelivery());
    await flush();
    expect(last?.permissionDenied).toBe(true);
  });

  it("permissão concedida: permissionDenied fica false", async () => {
    mockStart.mockResolvedValue("started");
    renderHook(makeDelivery());
    await flush();
    expect(last?.permissionDenied).toBe(false);
  });

  it("logout (user vira null): para o rastreio", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderHook(makeDelivery({ status: "assigned" }));
    await flush();
    expect(mockStop).toHaveBeenCalled();
  });
});
