import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SlotForm, slotFormSchema } from "./SlotForm";

describe("slotFormSchema (story 55)", () => {
  const valid = { date: "2026-07-01", start: "08:00", end: "09:00", capacity: 5 };

  it("aceita janela válida e coage capacidade numérica", () => {
    const r = slotFormSchema.safeParse({ ...valid, capacity: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.capacity).toBe(3);
  });

  it("rejeita fim <= início", () => {
    const r = slotFormSchema.safeParse({ ...valid, end: "08:00" });
    expect(r.success).toBe(false);
  });

  it("rejeita capacidade < 1", () => {
    expect(slotFormSchema.safeParse({ ...valid, capacity: 0 }).success).toBe(false);
  });

  it("rejeita data ausente", () => {
    expect(slotFormSchema.safeParse({ ...valid, date: "" }).success).toBe(false);
  });
});

describe("SlotForm (story 55)", () => {
  it("submit válido dispara onSubmit com os valores", async () => {
    const onSubmit = vi.fn();
    render(<SlotForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar slot" }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      date: "2026-07-01",
      start: "08:00",
      end: "09:00",
      capacity: 5,
    });
  });

  it("bloqueia submit e mostra erro quando fim <= início", async () => {
    const onSubmit = vi.fn();
    render(<SlotForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "08:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar slot" }));
    await screen.findByText("O fim deve ser após o início");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("propaga a mensagem de erro externa", () => {
    render(<SlotForm onSubmit={vi.fn()} error="Falha ao adicionar o slot." />);
    expect(screen.getByText("Falha ao adicionar o slot.")).toBeInTheDocument();
  });
});
