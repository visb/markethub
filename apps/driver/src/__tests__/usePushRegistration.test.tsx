import React from "react";
import renderer, { act } from "react-test-renderer";
import type { ApiClient } from "@markethub/api-client";
import {
  routeFromResponse,
  usePushRegistration,
} from "../hooks/usePushRegistration";

/**
 * Story 50: registro de push no device (Expo). Mocka expo-notifications,
 * expo-router e o auth-context. Cobre: registra ao autenticar, revoga no logout,
 * no-op sem permissão/no web, e o mapeamento tap→rota.
 */

// ── mocks de módulo ──

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetToken = jest.fn();
const mockSetHandler = jest.fn();
const mockAddResponseListener = jest.fn();
const removeSub = jest.fn();

jest.mock("expo-notifications", () => ({
  setNotificationHandler: (h: unknown) => mockSetHandler(h),
  getPermissionsAsync: () => mockGetPermissions(),
  requestPermissionsAsync: () => mockRequestPermissions(),
  getExpoPushTokenAsync: () => mockGetToken(),
  addNotificationResponseReceivedListener: (cb: unknown) => mockAddResponseListener(cb),
}));

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (r: string) => mockRouterPush(r) },
}));

let mockPlatformOS = "ios";
jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

const mockUseAuth = jest.fn();
jest.mock("@/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── fakes ──

function makeApi() {
  return {
    registerDeviceToken: jest.fn().mockResolvedValue({ ok: true }),
    unregisterDeviceToken: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as ApiClient & {
    registerDeviceToken: jest.Mock;
    unregisterDeviceToken: jest.Mock;
  };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

function renderHook() {
  function Probe() {
    usePushRegistration();
    return null;
  }
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return {
    rerender: () =>
      act(() => {
        tree.update(<Probe />);
      }),
    unmount: () => act(() => tree.unmount()),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatformOS = "ios";
  mockGetPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  mockRequestPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  mockGetToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  mockAddResponseListener.mockReturnValue({ remove: removeSub });
});

describe("usePushRegistration", () => {
  it("registra o token no backend ao autenticar", async () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });

    renderHook();
    await flush();

    expect(mockGetToken).toHaveBeenCalled();
    expect(client.registerDeviceToken).toHaveBeenCalledWith("ExponentPushToken[abc]", "ios");
  });

  it("pede permissão quando ainda não concedida e pode perguntar", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });

    renderHook();
    await flush();

    expect(mockRequestPermissions).toHaveBeenCalled();
    expect(client.registerDeviceToken).toHaveBeenCalled();
  });

  it("no-op quando a permissão é negada", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });

    renderHook();
    await flush();

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(client.registerDeviceToken).not.toHaveBeenCalled();
  });

  it("no-op no web (sem push)", async () => {
    mockPlatformOS = "web";
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });

    renderHook();
    await flush();

    expect(mockGetPermissions).not.toHaveBeenCalled();
    expect(client.registerDeviceToken).not.toHaveBeenCalled();
  });

  it("revoga o token ao deslogar (transição user→null)", async () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });
    const { rerender } = renderHook();
    await flush();
    expect(client.registerDeviceToken).toHaveBeenCalled();

    // desloga: próxima render sem usuário
    mockUseAuth.mockReturnValue({ user: null, client });
    rerender();
    await flush();

    expect(client.unregisterDeviceToken).toHaveBeenCalledWith("ExponentPushToken[abc]");
  });

  it("não revoga se nunca registrou um token", async () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: null, client });
    renderHook();
    await flush();
    expect(client.unregisterDeviceToken).not.toHaveBeenCalled();
  });

  it("engole falha do registro (best-effort, não relança)", async () => {
    mockGetToken.mockRejectedValue(new Error("no network"));
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });

    renderHook();
    await expect(flush()).resolves.toBeUndefined();
    expect(client.registerDeviceToken).not.toHaveBeenCalled();
  });

  it("configura o handler de foreground (banner)", () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: null, client });
    renderHook();
    expect(mockSetHandler).toHaveBeenCalled();
  });

  it("tap na notificação navega p/ data.route", async () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });
    renderHook();
    await flush();

    const listener = mockAddResponseListener.mock.calls[0][0] as (r: unknown) => void;
    listener({
      notification: { request: { content: { data: { route: "/delivery/d1" } } } },
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/delivery/d1");
  });

  it("tap sem route não navega", async () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });
    renderHook();
    await flush();

    const listener = mockAddResponseListener.mock.calls[0][0] as (r: unknown) => void;
    listener({ notification: { request: { content: { data: {} } } } });
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("remove o listener no unmount", async () => {
    const client = makeApi();
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, client });
    const { unmount } = renderHook();
    await flush();
    unmount();
    expect(removeSub).toHaveBeenCalled();
  });
});

describe("routeFromResponse", () => {
  const make = (data: unknown) =>
    ({ notification: { request: { content: { data } } } }) as never;

  it("retorna a rota quando presente", () => {
    expect(routeFromResponse(make({ route: "/delivery/9" }))).toBe("/delivery/9");
  });

  it("retorna null sem route", () => {
    expect(routeFromResponse(make({ orderId: "o1" }))).toBeNull();
  });

  it("retorna null com route vazia", () => {
    expect(routeFromResponse(make({ route: "" }))).toBeNull();
  });

  it("retorna null com data ausente", () => {
    expect(routeFromResponse(make(undefined))).toBeNull();
  });
});
