import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantOffer, MerchantStock } from "@markethub/api-client";

const merchantOffers = vi.fn();
const merchantUpdateOffer = vi.fn();
const merchantUnlockOffer = vi.fn();
const merchantStocks = vi.fn();
const merchantUpdateStock = vi.fn();
const merchantUnlockStock = vi.fn();
const merchantUploadUrl = vi.fn();
const merchantCreateProduct = vi.fn();
const merchantUpdateProduct = vi.fn();
let user: { id: string } | null = { id: "u1" };

vi.mock("@/auth/auth-context", () => ({
  useAuth: () => ({
    api: {
      merchantOffers,
      merchantUpdateOffer,
      merchantUnlockOffer,
      merchantStocks,
      merchantUpdateStock,
      merchantUnlockStock,
      merchantUploadUrl,
      merchantCreateProduct,
      merchantUpdateProduct,
    },
    user,
  }),
}));

import {
  useCreateProduct,
  useOffers,
  useProductUploadUrl,
  useStocks,
  useUnlockOfferField,
  useUnlockStockField,
  useUpdateOffer,
  useUpdateProduct,
  useUpdateStock,
} from "./useCatalog";

const offer: MerchantOffer = {
  id: "o1",
  storeId: "s1",
  storeName: "Loja A",
  product: { id: "p1", name: "Arroz", brand: "Tio", imageUrl: null, saleType: "unit", categoryId: null },
  priceCents: 1000,
  promoPriceCents: null,
  available: true,
  lockedFields: [],
  stock: null,
};

const stock: MerchantStock = {
  id: "stk1",
  storeId: "s1",
  storeName: "Loja A",
  product: { id: "p1", name: "Arroz", brand: "Tio", saleType: "unit" },
  quantity: 5,
  available: true,
  lockedFields: [],
};

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCatalog hooks (story 11)", () => {
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
    user = { id: "u1" };
  });

  it("useOffers aplica filtros (storeId/search/available) na chamada", async () => {
    merchantOffers.mockResolvedValueOnce([offer]);
    const filters = { storeId: "s1", search: "arroz", available: true };
    const { result } = renderHook(() => useOffers(filters), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([offer]);
    expect(merchantOffers).toHaveBeenCalledWith(filters);
  });

  it("useOffers não busca sem usuário", () => {
    user = null;
    const { result } = renderHook(() => useOffers(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantOffers).not.toHaveBeenCalled();
  });

  it("useOffers respeita enabled=false", () => {
    const { result } = renderHook(() => useOffers({}, { enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(merchantOffers).not.toHaveBeenCalled();
  });

  it("useStocks passa storeId ao client", async () => {
    merchantStocks.mockResolvedValueOnce([stock]);
    const { result } = renderHook(() => useStocks("s1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantStocks).toHaveBeenCalledWith("s1");
  });

  it("useUpdateOffer envia só o patch e invalida ofertas + estoque", async () => {
    merchantUpdateOffer.mockResolvedValueOnce({});
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateOffer(), { wrapper });
    result.current.mutate({ id: "o1", patch: { priceCents: 1200 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateOffer).toHaveBeenCalledWith("o1", { priceCents: 1200 });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["catalog", "offers"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["catalog", "stocks"] });
  });

  it("useUnlockOfferField chama DELETE locks e invalida", async () => {
    merchantUnlockOffer.mockResolvedValueOnce({});
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUnlockOfferField(), { wrapper });
    result.current.mutate({ id: "o1", field: "priceCents" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUnlockOffer).toHaveBeenCalledWith("o1", "priceCents");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["catalog", "offers"] });
  });

  it("useUpdateStock envia o patch e invalida", async () => {
    merchantUpdateStock.mockResolvedValueOnce({});
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateStock(), { wrapper });
    result.current.mutate({ id: "stk1", patch: { quantity: 9 } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateStock).toHaveBeenCalledWith("stk1", { quantity: 9 });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["catalog", "stocks"] });
  });

  it("useUnlockStockField chama DELETE locks", async () => {
    merchantUnlockStock.mockResolvedValueOnce({});
    const { result } = renderHook(() => useUnlockStockField(), { wrapper });
    result.current.mutate({ id: "stk1", field: "quantity" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUnlockStock).toHaveBeenCalledWith("stk1", "quantity");
  });

  it("useCreateProduct repassa o input e invalida", async () => {
    merchantCreateProduct.mockResolvedValueOnce({ product: { id: "p2" } });
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateProduct(), { wrapper });
    const input = { storeId: "s1", name: "Feijão", priceCents: 800 };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantCreateProduct).toHaveBeenCalledWith(input);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["catalog", "offers"] });
  });

  it("useUpdateProduct repassa id e patch", async () => {
    merchantUpdateProduct.mockResolvedValueOnce({});
    const { result } = renderHook(() => useUpdateProduct(), { wrapper });
    result.current.mutate({ id: "p1", patch: { name: "Novo" } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUpdateProduct).toHaveBeenCalledWith("p1", { name: "Novo" });
  });

  it("useProductUploadUrl chama o client com filename/contentType", async () => {
    merchantUploadUrl.mockResolvedValueOnce({ uploadUrl: "u", publicUrl: "p", headers: {}, expiresInSeconds: 60 });
    const { result } = renderHook(() => useProductUploadUrl(), { wrapper });
    result.current.mutate({ filename: "a.png", contentType: "image/png" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(merchantUploadUrl).toHaveBeenCalledWith("a.png", "image/png");
  });
});
