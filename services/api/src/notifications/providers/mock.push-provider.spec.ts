import { MockPushProvider } from "./mock.push-provider";

/** Story 27 — provedor de push fake (dev/test): nunca reporta tokens inválidos. */
describe("MockPushProvider", () => {
  it("expõe o nome mock e nunca invalida tokens", async () => {
    const provider = new MockPushProvider();

    expect(provider.name).toBe("mock");
    const res = await provider.send(
      [{ token: "t1", platform: "android" }],
      { title: "t", body: "b" },
    );
    expect(res).toEqual({ invalidTokens: [] });
  });
});
