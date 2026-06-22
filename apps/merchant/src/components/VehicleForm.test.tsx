import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VehicleForm } from "./VehicleForm";

describe("VehicleForm (story 14)", () => {
  it("mostra as três opções de tipo", () => {
    render(<VehicleForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Moto" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Carro" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Van" })).toBeTruthy();
  });

  it("valida placa obrigatória/ inválida (zod) e não chama onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<VehicleForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "XX1" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await screen.findByText("Placa inválida");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submete placa normalizada (caixa alta, sem espaços) e tipo", async () => {
    const onSubmit = vi.fn();
    render(<VehicleForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: " abc1d23 " } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "van" } });
    fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Fiorino" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      plate: "ABC1D23",
      type: "van",
      description: "Fiorino",
    });
  });

  it("pré-preenche para edição (defaultValues) e usa o label de submit", () => {
    render(
      <VehicleForm
        title="Editar veículo"
        submitLabel="Salvar"
        defaultValues={{ plate: "XYZ9A88", type: "motorcycle", description: "Moto" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe("XYZ9A88");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeTruthy();
  });

  it("cancela ao clicar em Cancelar", () => {
    const onCancel = vi.fn();
    render(<VehicleForm onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
