import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useStoreClosures = vi.fn();
const useAddStoreClosure = vi.fn();
const useRemoveStoreClosure = vi.fn();

vi.mock("@/api/hooks/useStoreHours", () => ({
  useStoreClosures: (...a: unknown[]) => useStoreClosures(...a),
  useAddStoreClosure: (...a: unknown[]) => useAddStoreClosure(...a),
  useRemoveStoreClosure: (...a: unknown[]) => useRemoveStoreClosure(...a),
}));

import { StoreClosuresSection } from "./StoreClosuresSection";

const addMutate = vi.fn();
const removeMutate = vi.fn();

function addMock(over: Record<string, unknown> = {}) {
  return { mutate: addMutate, isPending: false, isError: false, error: null, ...over };
}
function removeMock(over: Record<string, unknown> = {}) {
  return { mutate: removeMutate, isPending: false, ...over };
}

// Uma data claramente futura (formato ISO) p/ passar o refine.
const FUTURE = "2099-12-25";

describe("StoreClosuresSection (story 52)", () => {
  beforeEach(() => {
    addMutate.mockReset();
    removeMutate.mockReset();
    useAddStoreClosure.mockReturnValue(addMock());
    useRemoveStoreClosure.mockReturnValue(removeMock());
  });

  it("lista fechamentos com data BR + motivo", () => {
    useStoreClosures.mockReturnValue({
      data: [{ id: "c1", date: "2099-12-25", reason: "Natal" }],
      isLoading: false,
    });
    render(<StoreClosuresSection storeId="s1" />);
    expect(screen.getByText("25/12/2099")).toBeTruthy();
    expect(screen.getByText("— Natal")).toBeTruthy();
  });

  it("estado vazio", () => {
    useStoreClosures.mockReturnValue({ data: [], isLoading: false });
    render(<StoreClosuresSection storeId="s1" />);
    expect(screen.getByText("Nenhum fechamento cadastrado.")).toBeTruthy();
  });

  it("adiciona um fechamento (data + motivo) e reseta o form", async () => {
    useStoreClosures.mockReturnValue({ data: [], isLoading: false });
    render(<StoreClosuresSection storeId="s1" />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: FUTURE } });
    fireEvent.change(screen.getByPlaceholderText("Feriado"), { target: { value: "Natal" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar fechamento" }));
    await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toEqual({ date: FUTURE, reason: "Natal" });
  });

  it("motivo vazio vira null", async () => {
    useStoreClosures.mockReturnValue({ data: [], isLoading: false });
    render(<StoreClosuresSection storeId="s1" />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: FUTURE } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar fechamento" }));
    await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
    expect(addMutate.mock.calls[0][0]).toEqual({ date: FUTURE, reason: null });
  });

  it("rejeita data no passado (zod refine)", async () => {
    useStoreClosures.mockReturnValue({ data: [], isLoading: false });
    render(<StoreClosuresSection storeId="s1" />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2000-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar fechamento" }));
    await screen.findByText("Escolha uma data futura");
    expect(addMutate).not.toHaveBeenCalled();
  });

  it("remove um fechamento", () => {
    useStoreClosures.mockReturnValue({
      data: [{ id: "c1", date: "2099-12-25", reason: null }],
      isLoading: false,
    });
    render(<StoreClosuresSection storeId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(removeMutate).toHaveBeenCalledWith("c1");
  });

  it("exibe erro da API ao adicionar", () => {
    useStoreClosures.mockReturnValue({ data: [], isLoading: false });
    useAddStoreClosure.mockReturnValue(addMock({ isError: true, error: new Error("x") }));
    render(<StoreClosuresSection storeId="s1" />);
    expect(screen.getByText("Falha ao adicionar o fechamento.")).toBeTruthy();
  });
});
