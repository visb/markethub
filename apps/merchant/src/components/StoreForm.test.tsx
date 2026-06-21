import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoreForm, toStorePayload } from "./StoreForm";

describe("StoreForm (story 08)", () => {
  it("toStorePayload converte strings vazias em null e mantém preenchidas", () => {
    const payload = toStorePayload({
      name: "  Loja  ",
      externalId: "",
      street: "Rua A",
      number: "",
      district: "",
      city: "Curitiba",
      state: "PR",
      zipCode: "",
      avgPrepMinutes: 20,
      active: false,
    });
    expect(payload).toEqual({
      name: "Loja",
      externalId: null,
      street: "Rua A",
      number: null,
      district: null,
      city: "Curitiba",
      state: "PR",
      zipCode: null,
      avgPrepMinutes: 20,
      active: false,
    });
  });

  it("valida nome obrigatório (zod) e não chama onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<StoreForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await screen.findByText("Informe o nome da loja");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submete valores válidos", async () => {
    const onSubmit = vi.fn();
    render(<StoreForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Loja X" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].name).toBe("Loja X");
  });

  it("cancela ao clicar em Cancelar", () => {
    const onCancel = vi.fn();
    render(<StoreForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
