import { describe, expect, it, vi } from "vitest";
import type { ApiClient, MerchantContextDTO } from "@markethub/api-client";
import { getMerchantContext } from "./merchant";

describe("api/merchant", () => {
  it("getMerchantContext delega ao ApiClient.merchantContext", async () => {
    const ctx: MerchantContextDTO = { role: "manager", merchantId: "m1", stores: [], merchantSuspended: false };
    const api = { merchantContext: vi.fn().mockResolvedValue(ctx) } as unknown as ApiClient;
    await expect(getMerchantContext(api)).resolves.toEqual(ctx);
    expect(api.merchantContext).toHaveBeenCalledTimes(1);
  });
});
