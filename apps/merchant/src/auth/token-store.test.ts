import { beforeEach, describe, expect, it } from "vitest";
import { LocalTokenStore } from "./token-store";

describe("LocalTokenStore", () => {
  beforeEach(() => localStorage.clear());

  it("set/get/clear no localStorage com chaves do app merchant", () => {
    const store = new LocalTokenStore();
    expect(store.getAccess()).toBeNull();
    expect(store.getRefresh()).toBeNull();

    store.setTokens({ accessToken: "a1", refreshToken: "r1" });
    expect(store.getAccess()).toBe("a1");
    expect(store.getRefresh()).toBe("r1");
    expect(localStorage.getItem("mh_merchant_access")).toBe("a1");

    store.clear();
    expect(store.getAccess()).toBeNull();
    expect(store.getRefresh()).toBeNull();
  });
});
