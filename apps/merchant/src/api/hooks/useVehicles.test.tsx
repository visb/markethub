import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VehicleDTO } from "@markethub/api-client";

const merchantVehicles = vi.fn();
const merchantCreateVehicle = vi.fn();
const merchantUpdateVehicle = vi.fn();
const merchantRemoveVehicle = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: { merchantVehicles, merchantCreateVehicle, merchantUpdateVehicle, merchantRemoveVehicle },
    user,
  }),
}));

import {
  useCreateVehicle,
  useDeleteVehicle,
  useUpdateVehicle,
  useVehicles,
} from "./useVehicles";

const vehicleRow: VehicleDTO = {
  id: "v1",
  merchantId: "m1",
  plate: "ABC1D23",
  type: "car",
  description: "Fiorino branca",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useVehicles hooks (story 14)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    merchantVehicles.mockReset();
    merchantCreateVehicle.mockReset();
    merchantUpdateVehicle.mockReset();
    merchantRemoveVehicle.mockReset();
    user = { id: "u1" };
  });

  it("useVehicles busca a lista (sem filtro de rede)", async () => {
    merchantVehicles.mockResolvedValueOnce([vehicleRow]);
    const { result } = renderHook(() => useVehicles(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([vehicleRow]);
    expect(merchantVehicles).toHaveBeenCalledWith(undefined);
  });

  it("useVehicles não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useVehicles(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantVehicles).not.toHaveBeenCalled();
  });

  it("useCreateVehicle invalida a árvore de veículos no sucesso", async () => {
    merchantCreateVehicle.mockResolvedValueOnce(vehicleRow);
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateVehicle(), { wrapper });
    const input = { plate: "ABC1D23", type: "car" as const, description: "Fiorino branca" };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantCreateVehicle).toHaveBeenCalledWith(input);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
  });

  it("useUpdateVehicle chama o client com id e patch e invalida", async () => {
    merchantUpdateVehicle.mockResolvedValueOnce({ ...vehicleRow, active: false });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateVehicle(), { wrapper });
    result.current.mutate({ id: "v1", patch: { active: false } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateVehicle).toHaveBeenCalledWith("v1", { active: false });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
  });

  it("useDeleteVehicle repassa hard e invalida", async () => {
    merchantRemoveVehicle.mockResolvedValueOnce({ id: "v1", removed: true });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteVehicle(), { wrapper });
    result.current.mutate({ id: "v1", hard: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantRemoveVehicle).toHaveBeenCalledWith("v1", true);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["vehicles"] });
  });
});
