import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useStoreHours = vi.fn();
const useSetStoreHours = vi.fn();

vi.mock("@/api/hooks/useStoreHours", () => ({
  useStoreHours: (...args: unknown[]) => useStoreHours(...args),
  useSetStoreHours: (...args: unknown[]) => useSetStoreHours(...args),
}));

import { StoreHoursSection } from "./StoreHoursSection";

const mutate = vi.fn();

function mockMutation(over: Record<string, unknown> = {}) {
  return { mutate, isPending: false, isError: false, isSuccess: false, error: null, ...over };
}

describe("StoreHoursSection (story 52)", () => {
  beforeEach(() => {
    mutate.mockReset();
    useSetStoreHours.mockReturnValue(mockMutation());
  });

  it("mostra 'Carregando' enquanto busca", () => {
    useStoreHours.mockReturnValue({ data: undefined, isLoading: true });
    render(<StoreHoursSection storeId="s1" />);
    expect(screen.getByText("Carregando horários…")).toBeTruthy();
  });

  it("renderiza a faixa de um dia aberto em HH:MM", () => {
    useStoreHours.mockReturnValue({
      data: [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }],
      isLoading: false,
    });
    render(<StoreHoursSection storeId="s1" />);
    expect((screen.getByLabelText("Segunda abre") as HTMLInputElement).value).toBe("08:00");
    expect((screen.getByLabelText("Segunda fecha") as HTMLInputElement).value).toBe("22:00");
  });

  it("submete só os dias abertos convertidos p/ minutos", async () => {
    useStoreHours.mockReturnValue({
      data: [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }],
      isLoading: false,
    });
    render(<StoreHoursSection storeId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar horário" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toEqual([{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }]);
  });

  it("bloqueia submit quando fechamento é antes da abertura", async () => {
    useStoreHours.mockReturnValue({
      data: [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }],
      isLoading: false,
    });
    render(<StoreHoursSection storeId="s1" />);
    fireEvent.change(screen.getByLabelText("Segunda fecha"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar horário" }));
    await screen.findByText("Fechamento deve ser após a abertura");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("desmarcar um dia o exibe como Fechado e não envia a faixa", async () => {
    useStoreHours.mockReturnValue({
      data: [{ id: "h1", dayOfWeek: 1, opensAt: 480, closesAt: 1320 }],
      isLoading: false,
    });
    render(<StoreHoursSection storeId="s1" />);
    // Segunda começa aberta (único dia com faixa); ao desmarcar, some o input.
    expect(screen.getByLabelText("Segunda abre")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Segunda"));
    await waitFor(() => expect(screen.queryByLabelText("Segunda abre")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Salvar horário" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][0]).toEqual([]);
  });

  it("exibe erro da API ao falhar", () => {
    useStoreHours.mockReturnValue({ data: [], isLoading: false });
    useSetStoreHours.mockReturnValue(mockMutation({ isError: true, error: new Error("x") }));
    render(<StoreHoursSection storeId="s1" />);
    expect(screen.getByText("Falha ao salvar o horário.")).toBeTruthy();
  });
});
