import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { previewCount, SlotBatchForm, slotBatchFormSchema } from "./SlotBatchForm";

describe("previewCount (story 55)", () => {
  it("conta os slots previstos p/ o período/janela", () => {
    // 01/07/2026 é quarta; período de um dia só, 08–12 / 60min = 4
    const n = previewCount({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      weekdays: [3],
      windowStart: "08:00",
      windowEnd: "12:00",
      durationMin: 60,
    });
    expect(n).toBe(4);
  });

  it("é 0 quando faltam parâmetros", () => {
    expect(previewCount({})).toBe(0);
  });
});

describe("slotBatchFormSchema (story 55)", () => {
  const valid = {
    dateFrom: "2026-07-01",
    dateTo: "2026-07-07",
    weekdays: [1, 3],
    windowStart: "08:00",
    windowEnd: "20:00",
    durationMin: 60,
    capacity: 5,
  };
  it("aceita spec válida", () => {
    expect(slotBatchFormSchema.safeParse(valid).success).toBe(true);
  });
  it("rejeita sem dias da semana", () => {
    expect(slotBatchFormSchema.safeParse({ ...valid, weekdays: [] }).success).toBe(false);
  });
  it("rejeita janela invertida", () => {
    expect(slotBatchFormSchema.safeParse({ ...valid, windowEnd: "08:00" }).success).toBe(false);
  });
});

describe("SlotBatchForm (story 55)", () => {
  it("mostra o preview e submete a spec quando válida", async () => {
    const onSubmit = vi.fn();
    render(<SlotBatchForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });
    // default 08–20 / 60min em 01/07 (qua, marcada por padrão) = 12
    expect(await screen.findByText("12 slot(s) serão gerados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gerar slots" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ weekdays: [1, 2, 3, 4, 5], durationMin: 60 });
  });

  it("desmarcar um dia recalcula o preview", async () => {
    render(<SlotBatchForm onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-07-01" } });
    await screen.findByText("12 slot(s) serão gerados");
    // 01/07 é quarta (dia 3): desmarcá-la zera o preview
    fireEvent.click(screen.getByLabelText("Qua"));
    expect(await screen.findByText("Nenhum slot para os parâmetros atuais")).toBeInTheDocument();
  });

  it("mostra o resumo do resultado (criados/pulados)", () => {
    render(<SlotBatchForm onSubmit={vi.fn()} result={{ created: 10, skipped: 2 }} />);
    expect(screen.getByText("10 criado(s) · 2 pulado(s)")).toBeInTheDocument();
  });
});
