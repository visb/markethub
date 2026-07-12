import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@markethub/api-client";
import type { SlotDTO } from "@markethub/api-client";

let ctx: { stores: { id: string; name: string; merchantId: string }[] } | undefined;
let slotsResult: { data?: SlotDTO[]; isLoading: boolean };
const createMutate = vi.fn();
const createMutateAsync = vi.fn();
const deleteMutate = vi.fn();

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ({ data: ctx }),
}));

vi.mock("@/api/hooks/useSlots", () => ({
  useStoreSlots: () => slotsResult,
  useCreateSlot: () => ({ mutate: createMutate, mutateAsync: createMutateAsync, isPending: false }),
  useDeleteSlot: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { Slots } from "./Slots";

const slot = (over: Partial<SlotDTO> = {}): SlotDTO => ({
  id: "sl1",
  storeId: "s1",
  start: "2026-07-01T11:00:00.000Z",
  end: "2026-07-01T12:00:00.000Z",
  capacity: 5,
  reserved: 2,
  createdAt: "2026-06-01T00:00:00.000Z",
  ...over,
});

describe("Slots (story 55)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    createMutateAsync.mockReset().mockResolvedValue({});
    deleteMutate.mockClear();
    ctx = { stores: [{ id: "s1", name: "Loja Centro", merchantId: "m1" }] };
    slotsResult = { data: [slot()], isLoading: false };
  });

  it("aviso quando não há loja no escopo", () => {
    ctx = { stores: [] };
    render(<Slots />);
    expect(screen.getByText("Nenhuma loja no seu escopo.")).toBeInTheDocument();
  });

  it("lista os slots com capacidade e reservado/capacidade", () => {
    render(<Slots />);
    expect(screen.getByText(/capacidade 5 · 2\/5 reservado\(s\)/)).toBeInTheDocument();
  });

  it("estado vazio", () => {
    slotsResult = { data: [], isLoading: false };
    render(<Slots />);
    expect(screen.getByText("Nenhum slot cadastrado.")).toBeInTheDocument();
  });

  it("agrupa por dia (um slot por dia = uma linha cada)", () => {
    slotsResult = {
      data: [slot(), slot({ id: "sl2", start: "2026-07-02T11:00:00.000Z", end: "2026-07-02T12:00:00.000Z" })],
      isLoading: false,
    };
    render(<Slots />);
    expect(screen.getAllByRole("button", { name: "Remover" })).toHaveLength(2);
  });

  it("remover pede confirmação (mostrando reservas) e só então deleta", () => {
    render(<Slots />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(screen.getByText(/Remover slot\? 2 reserva\(s\)/)).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0][0]).toBe("sl1");
  });

  it("cancelar a confirmação não deleta", () => {
    render(<Slots />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument();
  });

  it("adicionar slot avulso converte p/ ISO e chama create", async () => {
    render(<Slots />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-07-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar slot" }));
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const payload = createMutate.mock.calls[0][0];
    expect(payload).toMatchObject({ storeId: "s1", capacity: 5 });
    expect(typeof payload.start).toBe("string");
    expect(new Date(payload.end).getTime() - new Date(payload.start).getTime()).toBe(3_600_000);
  });

  it("gerar semana dispara um create por janela e mostra o resumo", async () => {
    render(<Slots />);
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });
    // 01/07 (qua, marcada) 08–20 / 60min = 12
    await screen.findByText("12 slot(s) serão gerados");
    fireEvent.click(screen.getByRole("button", { name: "Gerar slots" }));
    await vi.waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(12));
    expect(await screen.findByText("12 criado(s)")).toBeInTheDocument();
  });

  it("gerar semana mostra erro quando um POST falha (não-409)", async () => {
    createMutateAsync.mockReset().mockRejectedValue(
      new ApiClientError(400, { code: "INVALID_SLOT_WINDOW", message: "Janela inválida" }),
    );
    render(<Slots />);
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });
    await screen.findByText("12 slot(s) serão gerados");
    fireEvent.click(screen.getByRole("button", { name: "Gerar slots" }));
    expect(await screen.findByText("Janela inválida")).toBeInTheDocument();
  });

  it("adicionar slot mostra erro quando o create falha", async () => {
    createMutate.mockImplementation((_payload, opts) =>
      opts.onError(new ApiClientError(400, { code: "INVALID_CAPACITY", message: "Capacidade inválida" })),
    );
    render(<Slots />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-07-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar slot" }));
    expect(await screen.findByText("Capacidade inválida")).toBeInTheDocument();
  });

  it("remover mostra erro quando o delete falha (ex. slot com reserva)", () => {
    deleteMutate.mockImplementation((_id, opts) =>
      opts.onError(new ApiClientError(400, { code: "SLOT_HAS_RESERVATIONS", message: "Slot com reservas" })),
    );
    render(<Slots />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Slot com reservas")).toBeInTheDocument();
  });

  it("mostra loading enquanto busca os slots", () => {
    slotsResult = { data: undefined, isLoading: true };
    render(<Slots />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("com múltiplas lojas mostra o seletor e troca a loja", () => {
    ctx = {
      stores: [
        { id: "s1", name: "Loja Centro", merchantId: "m1" },
        { id: "s2", name: "Loja Sul", merchantId: "m1" },
      ],
    };
    render(<Slots />);
    const select = screen.getByLabelText("Loja") as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "s2" } });
    expect(select.value).toBe("s2");
  });
});
