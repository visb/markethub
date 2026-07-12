import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@markethub/api-client";
import type { MerchantContextDTO, MerchantStoreDetailDTO } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
let storesResult: { data?: MerchantStoreDetailDTO[]; isLoading: boolean };
const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useStores", () => ({
  useStores: () => storesResult,
  useCreateStore: () => ({ mutate: createMutate, isPending: false }),
  useUpdateStore: () => ({ mutate: updateMutate, isPending: false }),
}));
// Story 52: as seções de horário/fechamentos têm testes próprios; aqui só
// verificamos o CRUD da loja, então as stubamos para não puxar hooks/React Query.
vi.mock("@/components/StoreHoursSection", () => ({ StoreHoursSection: () => null }));
vi.mock("@/components/StoreClosuresSection", () => ({ StoreClosuresSection: () => null }));
// Story 57: pausa tem teste próprio (PauseStoreControl.test); aqui só o CRUD.
vi.mock("@/components/PauseStoreControl", () => ({ PauseStoreControl: () => null }));

import { Stores } from "./Stores";

const store = (over: Partial<MerchantStoreDetailDTO> = {}): MerchantStoreDetailDTO => ({
  id: "s1",
  merchantId: "m1",
  name: "Loja Centro",
  externalId: null,
  street: "Rua A",
  number: "10",
  district: null,
  city: "Curitiba",
  state: "PR",
  zipCode: null,
  latitude: -25.4,
  longitude: -49.2,
  avgPrepMinutes: 15,
  active: true,
  pausedAt: null,
  deliveryFeeCents: null,
  minOrderCents: null,
  deliveryRadiusKm: null,
  merchantDeliveryFeeCents: 700,
  ...over,
});

describe("Stores (story 08 CRUD)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    ctx = { data: { role: "owner", merchantId: "m1", stores: [] } };
    storesResult = { data: [store()], isLoading: false };
  });

  it("mostra loading", () => {
    storesResult = { data: undefined, isLoading: true };
    render(<Stores />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio", () => {
    storesResult = { data: [], isLoading: false };
    render(<Stores />);
    expect(screen.getByText("Nenhuma loja cadastrada ainda.")).toBeInTheDocument();
  });

  it("lista lojas com endereço e marca inativa", () => {
    storesResult = { data: [store(), store({ id: "s2", name: "Loja Sul", active: false })], isLoading: false };
    render(<Stores />);
    expect(screen.getByText("Loja Centro")).toBeInTheDocument();
    expect(screen.getByText("Loja Sul")).toBeInTheDocument();
    expect(screen.getByText("inativa")).toBeInTheDocument();
    expect(screen.getAllByText(/Rua A, 10, Curitiba, PR/).length).toBeGreaterThan(0);
  });

  it("marca 'pausada' na lista quando a loja tem pausedAt (story 57)", () => {
    storesResult = {
      data: [store({ pausedAt: "2026-07-12T10:00:00.000Z" })],
      isLoading: false,
    };
    render(<Stores />);
    expect(screen.getByText(/pausada/)).toBeInTheDocument();
  });

  it("owner vê botão Nova loja e ações de editar", () => {
    render(<Stores />);
    expect(screen.getByRole("button", { name: "Nova loja" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("manager NÃO vê botão Nova loja nem editar (can=false)", () => {
    ctx = { data: { role: "manager", merchantId: "m1", stores: [] } };
    render(<Stores />);
    expect(screen.queryByRole("button", { name: "Nova loja" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("abre o form de criação ao clicar em Nova loja", () => {
    render(<Stores />);
    fireEvent.click(screen.getByRole("button", { name: "Nova loja" }));
    expect(screen.getByText("Nova loja")).toBeInTheDocument(); // título do form (h2)
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });

  it("abre o form de edição populado ao clicar em Editar", () => {
    render(<Stores />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar loja")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Loja Centro")).toBeInTheDocument();
  });

  it("criar: submete e chama a mutation; volta à lista no sucesso", async () => {
    createMutate.mockImplementation((_payload, opts) => opts.onSuccess?.());
    render(<Stores />);
    fireEvent.click(screen.getByRole("button", { name: "Nova loja" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Filial" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({ name: "Filial" });
    await screen.findByRole("button", { name: "Nova loja" }); // voltou à lista
  });

  it("editar: erro da mutation exibe a mensagem do backend", async () => {
    updateMutate.mockImplementation((_patch, opts) =>
      opts.onError?.(new ApiClientError(403, { code: "NOT_AN_OWNER", message: "Sem permissão" })),
    );
    render(<Stores />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Sem permissão")).toBeInTheDocument();
  });
});
