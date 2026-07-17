import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO } from "@markethub/api-client";

const merchantContext = vi.fn();
let user: { id: string } | null = { id: "u1" };
vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { merchantContext }, user }),
}));

import { useMerchantContext } from "./useMerchantContext";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const ctx: MerchantContextDTO = { role: "owner", merchantId: "m1", stores: [{ id: "s1", name: "Loja", merchantId: "m1" }], merchantSuspended: false };

describe("useMerchantContext (story 07)", () => {
  it("popula papel e lojas a partir do client", async () => {
    user = { id: "u1" };
    merchantContext.mockResolvedValueOnce(ctx);
    const { result } = renderHook(() => useMerchantContext(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(ctx);
    expect(merchantContext).toHaveBeenCalledTimes(1);
  });

  it("não busca quando não há usuário (enabled=false)", async () => {
    user = null;
    merchantContext.mockClear();
    const { result } = renderHook(() => useMerchantContext(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantContext).not.toHaveBeenCalled();
  });
});
