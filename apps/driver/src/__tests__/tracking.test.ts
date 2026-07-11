/**
 * Story 51: camada de device do rastreio ao vivo do entregador. Mocka
 * expo-location, expo-task-manager e expo-secure-store (sem device real) + fetch.
 * Cobre: ciclo start/stop, permissão negada, no-op no web, POST da posição e o
 * handler da task de background.
 */

// ── mocks de módulo ──

const mockRequestBg = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockHasStarted = jest.fn();

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestBackgroundPermissionsAsync: () => mockRequestBg(),
  startLocationUpdatesAsync: (...a: unknown[]) => mockStart(...a),
  stopLocationUpdatesAsync: (...a: unknown[]) => mockStop(...a),
  hasStartedLocationUpdatesAsync: (...a: unknown[]) => mockHasStarted(...a),
}));

let registeredTask: ((body: unknown) => unknown) | null = null;
const mockDefineTask = jest.fn((_name: string, fn: (body: unknown) => unknown) => {
  registeredTask = fn;
});
jest.mock("expo-task-manager", () => ({
  defineTask: (name: string, fn: (body: unknown) => unknown) => mockDefineTask(name, fn),
}));

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockStore.delete(k);
    return Promise.resolve();
  },
}));

let mockPlatformOS = "ios";
jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

// Import lazy: `tracking.ts` chama TaskManager.defineTask no carregamento — precisa
// dos mocks já inicializados (imports ES são içados acima das consts do mock).
type TrackingModule = typeof import("../tracking");
let LOCATION_TASK_NAME: TrackingModule["LOCATION_TASK_NAME"];
let handleLocationTask: TrackingModule["handleLocationTask"];
let postLocation: TrackingModule["postLocation"];
let readSession: TrackingModule["readSession"];
let startTracking: TrackingModule["startTracking"];
let stopTracking: TrackingModule["stopTracking"];

beforeAll(() => {
  const mod = require("../tracking") as TrackingModule;
  ({ LOCATION_TASK_NAME, handleLocationTask, postLocation, readSession, startTracking, stopTracking } =
    mod);
});

const SESSION_KEY = "mh_tracking_session";
const ACCESS_KEY = "mh_access";
const session = { deliveryId: "d1", apiBaseUrl: "http://api.test/api/v1" };

function makeLoc(over: Record<string, unknown> = {}) {
  return {
    coords: { latitude: -23.5, longitude: -46.6, heading: 90, ...(over.coords as object) },
    timestamp: 1_752_000_000_000,
    ...over,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockPlatformOS = "ios";
  mockRequestBg.mockResolvedValue({ granted: true });
  mockHasStarted.mockResolvedValue(false);
  mockStart.mockResolvedValue(undefined);
  mockStop.mockResolvedValue(undefined);
  (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true });
});

describe("registro da task", () => {
  it("define a task de background no carregamento do módulo", () => {
    // registrada em beforeAll (require do módulo); clearAllMocks limpa o histórico,
    // então validamos o handler capturado + o nome exportado.
    expect(registeredTask).toEqual(expect.any(Function));
    expect(LOCATION_TASK_NAME).toBe("markethub-delivery-location");
  });
});

describe("startTracking", () => {
  it("permissão concedida: persiste a sessão e inicia os updates com throttle", async () => {
    const result = await startTracking(session);
    expect(result).toBe("started");
    expect(await readSession()).toEqual(session);
    expect(mockStart).toHaveBeenCalledWith(
      LOCATION_TASK_NAME,
      expect.objectContaining({ timeInterval: 10_000, distanceInterval: 50 }),
    );
  });

  it("permissão negada: devolve 'denied' e não inicia os updates", async () => {
    mockRequestBg.mockResolvedValue({ granted: false });
    const result = await startTracking(session);
    expect(result).toBe("denied");
    expect(mockStart).not.toHaveBeenCalled();
    expect(await readSession()).toBeNull();
  });

  it("web: no-op ('unsupported'), sem pedir permissão", async () => {
    mockPlatformOS = "web";
    const result = await startTracking(session);
    expect(result).toBe("unsupported");
    expect(mockRequestBg).not.toHaveBeenCalled();
  });

  it("updates já iniciados: não chama startLocationUpdatesAsync de novo", async () => {
    mockHasStarted.mockResolvedValue(true);
    const result = await startTracking(session);
    expect(result).toBe("started");
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("stopTracking", () => {
  it("limpa a sessão e para os updates quando iniciados", async () => {
    mockStore.set(SESSION_KEY, JSON.stringify(session));
    mockHasStarted.mockResolvedValue(true);
    await stopTracking();
    expect(await readSession()).toBeNull();
    expect(mockStop).toHaveBeenCalledWith(LOCATION_TASK_NAME);
  });

  it("não para os updates se não estavam iniciados", async () => {
    mockHasStarted.mockResolvedValue(false);
    await stopTracking();
    expect(mockStop).not.toHaveBeenCalled();
  });

  it("web: apenas limpa a sessão (no-op de device)", async () => {
    mockPlatformOS = "web";
    globalThis.localStorage?.setItem?.(SESSION_KEY, JSON.stringify(session));
    await stopTracking();
    expect(mockStop).not.toHaveBeenCalled();
  });
});

describe("postLocation", () => {
  it("faz POST da posição com o token e o corpo tipado", async () => {
    mockStore.set(ACCESS_KEY, "jwt-abc");
    await postLocation(session, makeLoc());
    const fetchMock = (globalThis as unknown as { fetch: jest.Mock }).fetch;
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/driver/deliveries/d1/location",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer jwt-abc");
    expect(JSON.parse(init.body)).toEqual({
      lat: -23.5,
      lng: -46.6,
      heading: 90,
      recordedAt: new Date(1_752_000_000_000).toISOString(),
    });
  });

  it("sem token: não faz POST", async () => {
    await postLocation(session, makeLoc());
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it("heading ausente vira null", async () => {
    mockStore.set(ACCESS_KEY, "jwt");
    await postLocation(session, makeLoc({ coords: { latitude: 1, longitude: 2 } }));
    const init = (globalThis as unknown as { fetch: jest.Mock }).fetch.mock.calls[0][1];
    expect(JSON.parse(init.body).heading).toBeNull();
  });
});

describe("handleLocationTask (task de background)", () => {
  it("publica cada leitura da sessão ativa", async () => {
    mockStore.set(ACCESS_KEY, "jwt");
    mockStore.set(SESSION_KEY, JSON.stringify(session));
    await handleLocationTask({ data: { locations: [makeLoc(), makeLoc()] } });
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledTimes(2);
  });

  it("erro na task: não publica", async () => {
    mockStore.set(SESSION_KEY, JSON.stringify(session));
    await handleLocationTask({ error: new Error("boom") });
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it("sem sessão ativa: não publica", async () => {
    await handleLocationTask({ data: { locations: [makeLoc()] } });
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).not.toHaveBeenCalled();
  });

  it("falha de POST é engolida (best-effort)", async () => {
    mockStore.set(ACCESS_KEY, "jwt");
    mockStore.set(SESSION_KEY, JSON.stringify(session));
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(new Error("net"));
    await expect(
      handleLocationTask({ data: { locations: [makeLoc()] } }),
    ).resolves.toBeUndefined();
  });

  it("a task registrada delega a handleLocationTask", async () => {
    expect(registeredTask).toBeTruthy();
    mockStore.set(ACCESS_KEY, "jwt");
    mockStore.set(SESSION_KEY, JSON.stringify(session));
    await registeredTask!({ data: { locations: [makeLoc()] }, error: null });
    expect((globalThis as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledTimes(1);
  });
});

describe("readSession", () => {
  it("sessão corrompida no storage: devolve null", async () => {
    mockStore.set(SESSION_KEY, "{ nao-json");
    expect(await readSession()).toBeNull();
  });
});
