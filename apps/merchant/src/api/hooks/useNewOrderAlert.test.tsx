import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Fake realtime controlável: dispara eventos no teste. */
function makeRealtime() {
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  return {
    connected: false,
    on: vi.fn((event: string, h: (p: unknown) => void) => {
      const set = handlers.get(event) ?? [];
      set.push(h);
      handlers.set(event, set);
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribeStore: vi.fn(),
    subscribeOrder: vi.fn(),
    fire: (event: string, payload?: unknown) => {
      for (const h of handlers.get(event) ?? []) h(payload);
    },
  };
}

let realtime = makeRealtime();
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ realtime }),
}));

const play = vi.fn().mockResolvedValue(undefined);
const load = vi.fn();

import { useNewOrderAlert, readSoundPref } from "./useNewOrderAlert";
import { ORDER_CREATED_EVENT } from "@markethub/api-client";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

describe("useNewOrderAlert", () => {
  beforeEach(() => {
    realtime = makeRealtime();
    play.mockClear();
    load.mockClear();
    localStorage.clear();
    document.title = "MarketHub";
    setHidden(false);
    // mock global Audio (precisa ser construtível via `new Audio(src)`)
    class FakeAudio {
      play = play;
      load = load;
      constructor(public src: string) {}
    }
    vi.stubGlobal("Audio", FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggle liga o som e persiste no localStorage (opt-in)", () => {
    const { result } = renderHook(() => useNewOrderAlert(true));
    expect(result.current.soundEnabled).toBe(false);
    act(() => result.current.toggleSound());
    expect(result.current.soundEnabled).toBe(true);
    expect(readSoundPref()).toBe(true);
    // prime do áudio dentro do gesto do usuário (autoplay policy)
    expect(load).toHaveBeenCalled();
  });

  it("com som ligado: evento de pedido novo toca o chime", () => {
    localStorage.setItem("merchant.orderSound", "on");
    renderHook(() => useNewOrderAlert(true));
    act(() => realtime.fire(ORDER_CREATED_EVENT, { orderId: "o1" }));
    expect(play).toHaveBeenCalled();
  });

  it("com som desligado: evento não toca", () => {
    renderHook(() => useNewOrderAlert(true));
    act(() => realtime.fire(ORDER_CREATED_EVENT, { orderId: "o1" }));
    expect(play).not.toHaveBeenCalled();
  });

  it("aba em segundo plano: incrementa o contador no título; foco zera", () => {
    setHidden(true);
    renderHook(() => useNewOrderAlert(true));
    act(() => realtime.fire(ORDER_CREATED_EVENT, { orderId: "o1" }));
    act(() => realtime.fire(ORDER_CREATED_EVENT, { orderId: "o2" }));
    expect(document.title).toMatch(/^\(2\)/);
    // aba volta ao foco → visibilitychange zera
    setHidden(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(document.title).not.toMatch(/^\(\d+\)/);
  });

  it("não registra listener quando desabilitado", () => {
    renderHook(() => useNewOrderAlert(false));
    expect(realtime.on).not.toHaveBeenCalled();
  });
});
