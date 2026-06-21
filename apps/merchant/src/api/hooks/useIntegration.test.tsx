import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  merchantErpConfig: vi.fn(),
  merchantPutErpConfig: vi.fn(),
  merchantApiKeys: vi.fn(),
  merchantCreateApiKey: vi.fn(),
  merchantRevokeApiKey: vi.fn(),
  merchantWebhooks: vi.fn(),
  merchantCreateWebhook: vi.fn(),
  merchantUpdateWebhook: vi.fn(),
  merchantDeleteWebhook: vi.fn(),
  merchantTestWebhook: vi.fn(),
};
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({ api, user }),
}));

import {
  useApiKeys,
  useCreateApiKey,
  useCreateWebhook,
  useDeleteWebhook,
  useErpConfig,
  usePutErpConfig,
  useRevokeApiKey,
  useTestWebhook,
  useUpdateWebhook,
  useWebhooks,
} from "./useIntegration";

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useIntegration hooks (story 09)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    Object.values(api).forEach((m) => m.mockReset());
    user = { id: "u1" };
  });

  it("useErpConfig busca a config; não busca sem usuário", async () => {
    api.merchantErpConfig.mockResolvedValueOnce({ connectorType: "csv", connectorConfig: {}, availableTypes: ["csv"] });
    const { result } = renderHook(() => useErpConfig(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.connectorType).toBe("csv");

    user = null;
    const { result: r2 } = renderHook(() => useErpConfig(), { wrapper });
    expect(r2.current.fetchStatus).toBe("idle");
  });

  it("usePutErpConfig chama o client e invalida erp", async () => {
    api.merchantPutErpConfig.mockResolvedValueOnce({});
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => usePutErpConfig(), { wrapper });
    result.current.mutate({ connectorType: "csv", connectorConfig: { dir: "/d" } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.merchantPutErpConfig).toHaveBeenCalledWith({ connectorType: "csv", connectorConfig: { dir: "/d" } });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["integration", "erp"] });
  });

  it("api-keys: lista, cria e revoga invalidando a lista", async () => {
    api.merchantApiKeys.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useApiKeys(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const spy = vi.spyOn(qc, "invalidateQueries");
    api.merchantCreateApiKey.mockResolvedValueOnce({ key: "mk_live_x" });
    const { result: create } = renderHook(() => useCreateApiKey(), { wrapper });
    create.current.mutate("ERP");
    await waitFor(() => expect(create.current.isSuccess).toBe(true));
    expect(api.merchantCreateApiKey).toHaveBeenCalledWith("ERP");

    api.merchantRevokeApiKey.mockResolvedValueOnce({ id: "k1", revokedAt: "x" });
    const { result: revoke } = renderHook(() => useRevokeApiKey(), { wrapper });
    revoke.current.mutate("k1");
    await waitFor(() => expect(revoke.current.isSuccess).toBe(true));
    expect(api.merchantRevokeApiKey).toHaveBeenCalledWith("k1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["integration", "api-keys"] });
  });

  it("webhooks: lista, cria, atualiza, remove e testa", async () => {
    api.merchantWebhooks.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useWebhooks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    api.merchantCreateWebhook.mockResolvedValueOnce({ secret: "whsec_x" });
    const { result: create } = renderHook(() => useCreateWebhook(), { wrapper });
    create.current.mutate({ url: "https://x.example" });
    await waitFor(() => expect(create.current.isSuccess).toBe(true));
    expect(api.merchantCreateWebhook).toHaveBeenCalledWith({ url: "https://x.example" });

    api.merchantUpdateWebhook.mockResolvedValueOnce({});
    const { result: update } = renderHook(() => useUpdateWebhook(), { wrapper });
    update.current.mutate({ id: "w1", patch: { active: false } });
    await waitFor(() => expect(update.current.isSuccess).toBe(true));
    expect(api.merchantUpdateWebhook).toHaveBeenCalledWith("w1", { active: false });

    api.merchantDeleteWebhook.mockResolvedValueOnce({ id: "w1" });
    const { result: remove } = renderHook(() => useDeleteWebhook(), { wrapper });
    remove.current.mutate("w1");
    await waitFor(() => expect(remove.current.isSuccess).toBe(true));
    expect(api.merchantDeleteWebhook).toHaveBeenCalledWith("w1");

    api.merchantTestWebhook.mockResolvedValueOnce({ enqueued: true });
    const { result: test } = renderHook(() => useTestWebhook(), { wrapper });
    test.current.mutate("w1");
    await waitFor(() => expect(test.current.isSuccess).toBe(true));
    expect(api.merchantTestWebhook).toHaveBeenCalledWith("w1");
  });
});
