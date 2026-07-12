import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";

/**
 * Story 59: posição foreground do driver. Mocka expo-location; cobre concedida
 * (posição inicial + atualização via watch), negada (permissionDenied, posição
 * null) e desabilitada (no-op). Sem device real.
 */

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Location = require("expo-location");
const mockReq = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockGet = Location.getCurrentPositionAsync as jest.Mock;
const mockWatch = Location.watchPositionAsync as jest.Mock;

let captured: { position: { latitude: number; longitude: number } | null; permissionDenied: boolean } = {
  position: null,
  permissionDenied: false,
};

function Probe({ enabled }: { enabled?: boolean }) {
  captured = useCurrentLocation(enabled);
  return <Text>{captured.position ? "has" : "none"}</Text>;
}

async function renderProbe(enabled?: boolean) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe enabled={enabled} />);
  });
  return tree!;
}

beforeEach(() => {
  mockReq.mockReset();
  mockGet.mockReset();
  mockWatch.mockReset();
  captured = { position: null, permissionDenied: false };
});

describe("useCurrentLocation", () => {
  it("permissão concedida: define a posição inicial e atualiza via watch", async () => {
    mockReq.mockResolvedValue({ granted: true });
    mockGet.mockResolvedValue({ coords: { latitude: -25.4, longitude: -49.2 } });
    let watchCb: (loc: { coords: { latitude: number; longitude: number } }) => void = () => {};
    const remove = jest.fn();
    mockWatch.mockImplementation((_opts: unknown, cb: typeof watchCb) => {
      watchCb = cb;
      return Promise.resolve({ remove });
    });

    const tree = await renderProbe(true);
    expect(captured.permissionDenied).toBe(false);
    expect(captured.position).toEqual({ latitude: -25.4, longitude: -49.2 });

    await act(async () => {
      watchCb({ coords: { latitude: -25.41, longitude: -49.21 } });
    });
    expect(captured.position).toEqual({ latitude: -25.41, longitude: -49.21 });

    act(() => tree.unmount());
    expect(remove).toHaveBeenCalled();
  });

  it("permissão negada: permissionDenied e posição null", async () => {
    mockReq.mockResolvedValue({ granted: false });
    await renderProbe(true);
    expect(captured.permissionDenied).toBe(true);
    expect(captured.position).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("desabilitado: não pede permissão", async () => {
    await renderProbe(false);
    expect(mockReq).not.toHaveBeenCalled();
    expect(captured.position).toBeNull();
  });
});
