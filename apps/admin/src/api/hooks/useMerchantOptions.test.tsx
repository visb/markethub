import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api: { request }, user }),
}));

import { useMerchantOptions } from "./useMerchantOptions";

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useMerchantOptions (story 53)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockReset();
    user = { id: "u1" };
  });

  it("busca as redes via /admin/merchants", async () => {
    request.mockResolvedValueOnce([{ id: "m1", name: "Rede A" }]);
    const { result } = renderHook(() => useMerchantOptions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "m1", name: "Rede A" }]);
    expect(request).toHaveBeenCalledWith("/admin/merchants", { auth: true });
  });

  it("não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useMerchantOptions(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(request).not.toHaveBeenCalled();
  });
});
