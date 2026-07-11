import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { createPushProvider } from "./notifications.module";
import { ExpoPushProvider } from "./providers/expo.push-provider";
import { FcmPushProvider } from "./providers/fcm.push-provider";
import { MockPushProvider } from "./providers/mock.push-provider";

/**
 * Story 50 — a factory do módulo reconhece `PUSH_PROVIDER=expo`. Cobre também os
 * ramos fcm (com/sem chave) e o fallback mock.
 */

function config(values: Partial<Pick<Env, "PUSH_PROVIDER" | "FCM_SERVER_KEY">>) {
  return {
    get: (key: keyof Env) => values[key as "PUSH_PROVIDER" | "FCM_SERVER_KEY"],
  } as unknown as ConfigService<Env, true>;
}

describe("createPushProvider", () => {
  it("PUSH_PROVIDER=expo → ExpoPushProvider", () => {
    const provider = createPushProvider(config({ PUSH_PROVIDER: "expo" }));
    expect(provider).toBeInstanceOf(ExpoPushProvider);
    expect(provider.name).toBe("expo");
  });

  it("PUSH_PROVIDER=fcm com chave → FcmPushProvider", () => {
    const provider = createPushProvider(
      config({ PUSH_PROVIDER: "fcm", FCM_SERVER_KEY: "k" }),
    );
    expect(provider).toBeInstanceOf(FcmPushProvider);
  });

  it("PUSH_PROVIDER=fcm sem chave → cai no Mock", () => {
    const provider = createPushProvider(config({ PUSH_PROVIDER: "fcm" }));
    expect(provider).toBeInstanceOf(MockPushProvider);
  });

  it("PUSH_PROVIDER=mock → MockPushProvider", () => {
    const provider = createPushProvider(config({ PUSH_PROVIDER: "mock" }));
    expect(provider).toBeInstanceOf(MockPushProvider);
  });
});
