import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantContextDTO, MerchantOffer, MerchantStock } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
let offersResult: { data?: MerchantOffer[]; isLoading: boolean };
let stocksResult: { data?: MerchantStock[]; isLoading: boolean };
let lastOfferFilters: unknown;
let lastStockStoreId: string | undefined;
const updateOffer = vi.fn();
const toggleAvailable = vi.fn();
const unlockOffer = vi.fn();
const updateStock = vi.fn();
const unlockStock = vi.fn();
const createProduct = vi.fn();

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useCatalog", () => ({
  useOffers: (filters: unknown) => {
    lastOfferFilters = filters;
    return offersResult;
  },
  useStocks: (storeId?: string) => {
    lastStockStoreId = storeId;
    return stocksResult;
  },
  useUpdateOffer: () => ({ mutate: updateOffer, isPending: false }),
  useToggleOfferAvailable: () => ({ mutate: toggleAvailable, isPending: false }),
  useUnlockOfferField: () => ({ mutate: unlockOffer, isPending: false }),
  useUpdateStock: () => ({ mutate: updateStock, isPending: false }),
  useUnlockStockField: () => ({ mutate: unlockStock, isPending: false }),
  useCreateProduct: () => ({ mutate: createProduct, isPending: false }),
  useProductUploadUrl: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { Catalog } from "./Catalog";

const stores = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

const offer = (over: Partial<MerchantOffer> = {}): MerchantOffer => ({
  id: "o1",
  storeId: "s1",
  storeName: "Loja A",
  product: { id: "p1", name: "Arroz", brand: "Tio", imageUrl: null, saleType: "unit", categoryId: null },
  priceCents: 1000,
  promoPriceCents: null,
  available: true,
  lockedFields: [],
  stock: null,
  ...over,
});

const stock = (over: Partial<MerchantStock> = {}): MerchantStock => ({
  id: "stk1",
  storeId: "s1",
  storeName: "Loja A",
  product: { id: "p1", name: "Arroz", brand: "Tio", saleType: "unit" },
  quantity: 5,
  available: true,
  lockedFields: [],
  ...over,
});

describe("Catalog (story 11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOfferFilters = undefined;
    lastStockStoreId = undefined;
    ctx = { data: { role: "owner", merchantId: "m1", stores, merchantSuspended: false } };
    offersResult = { data: [offer()], isLoading: false };
    stocksResult = { data: [stock()], isLoading: false };
  });

  it("mostra loading de ofertas", () => {
    offersResult = { data: undefined, isLoading: true };
    render(<Catalog />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio de ofertas", () => {
    offersResult = { data: [], isLoading: false };
    render(<Catalog />);
    expect(screen.getByText("Nenhuma oferta encontrada.")).toBeInTheDocument();
  });

  it("lista ofertas com preço e nome", () => {
    render(<Catalog />);
    expect(screen.getByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*10,00/)).toBeInTheDocument();
  });

  it("filtra por loja e busca (passa filtros ao hook)", () => {
    render(<Catalog />);
    fireEvent.change(screen.getByLabelText("Loja"), { target: { value: "s2" } });
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "arr" } });
    fireEvent.change(screen.getByLabelText("Disponibilidade"), { target: { value: "true" } });
    expect(lastOfferFilters).toEqual({ storeId: "s2", search: "arr", available: true });
  });

  it("edita oferta e envia só o diff (PATCH parcial)", async () => {
    render(<Catalog />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Preço (R$)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(updateOffer).toHaveBeenCalledTimes(1));
    expect(updateOffer.mock.calls[0][0]).toMatchObject({ id: "o1", patch: { priceCents: 2000 } });
  });

  it("switch inline alterna a disponibilidade da oferta (story 57)", () => {
    render(<Catalog />);
    const sw = screen.getByRole("switch", { name: "Disponível: Arroz" });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    expect(toggleAvailable).toHaveBeenCalledTimes(1);
    expect(toggleAvailable.mock.calls[0][0]).toMatchObject({ id: "o1", available: false });
  });

  it("switch: erro na troca exibe a mensagem do backend (story 57)", () => {
    toggleAvailable.mockImplementation((_v, opts) =>
      opts.onError?.(new ApiClientError(403, { code: "STORE_NOT_MANAGED", message: "Sem permissão" })),
    );
    render(<Catalog />);
    fireEvent.click(screen.getByRole("switch", { name: "Disponível: Arroz" }));
    expect(screen.getByText("Sem permissão")).toBeInTheDocument();
  });

  it("mostra badge de campo travado e destrava via DELETE locks", () => {
    offersResult = { data: [offer({ lockedFields: ["priceCents"] })], isLoading: false };
    render(<Catalog />);
    expect(screen.getByText(/preço/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "destravar" }));
    expect(unlockOffer.mock.calls[0][0]).toMatchObject({ id: "o1", field: "priceCents" });
  });

  it("alterna para a aba de estoque e edita a quantidade (só o diff)", () => {
    render(<Catalog />);
    fireEvent.click(screen.getByRole("button", { name: "Estoque" }));
    expect(lastStockStoreId).toBeUndefined();
    const input = screen.getByLabelText("Estoque de Arroz");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(updateStock).toHaveBeenCalledTimes(1);
    expect(updateStock.mock.calls[0][0]).toMatchObject({ id: "stk1", patch: { quantity: 12 } });
  });

  it("estoque: alterna disponibilidade via updateStock", () => {
    render(<Catalog />);
    fireEvent.click(screen.getByRole("button", { name: "Estoque" }));
    fireEvent.click(screen.getByRole("button", { name: "Marcar indisponível" }));
    expect(updateStock).toHaveBeenCalledTimes(1);
    expect(updateStock.mock.calls[0][0]).toMatchObject({ id: "stk1", patch: { available: false } });
  });

  it("estoque: badge de campo travado destrava via DELETE locks", () => {
    stocksResult = { data: [stock({ lockedFields: ["quantity"] })], isLoading: false };
    render(<Catalog />);
    fireEvent.click(screen.getByRole("button", { name: "Estoque" }));
    fireEvent.click(screen.getByRole("button", { name: "destravar" }));
    expect(unlockStock.mock.calls[0][0]).toMatchObject({ id: "stk1", field: "quantity" });
  });

  it("estoque: não salva quando a quantidade não muda (só o diff)", () => {
    render(<Catalog />);
    fireEvent.click(screen.getByRole("button", { name: "Estoque" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(updateStock).not.toHaveBeenCalled();
  });

  it("abre o form de novo produto", () => {
    render(<Catalog />);
    fireEvent.click(screen.getByRole("button", { name: "Novo produto" }));
    expect(screen.getByRole("button", { name: "Cadastrar" })).toBeInTheDocument();
  });
});
