import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MerchantStoreDTO } from "@markethub/api-client";
import { StaffForm } from "./StaffForm";

const stores: MerchantStoreDTO[] = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

describe("StaffForm (story 10)", () => {
  it("oculta o papel 'Gerente' quando allowManager=false (gerente)", () => {
    render(
      <StaffForm stores={stores} allowManager={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("option", { name: "Gerente" })).toBeNull();
    expect(screen.getByRole("option", { name: "Separador" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Entregador" })).toBeTruthy();
  });

  it("mostra o papel 'Gerente' quando allowManager=true (dono)", () => {
    render(
      <StaffForm stores={stores} allowManager onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("option", { name: "Gerente" })).toBeTruthy();
  });

  it("valida campos obrigatórios (zod) e não chama onSubmit", async () => {
    const onSubmit = vi.fn();
    render(
      <StaffForm stores={stores} allowManager onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await screen.findByText("Informe o nome");
    await screen.findByText("E-mail inválido");
    await screen.findByText("Mínimo de 6 caracteres");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submete valores válidos com a loja selecionada", async () => {
    const onSubmit = vi.fn();
    render(
      <StaffForm stores={stores} allowManager onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "maria@loja.com" } });
    fireEvent.change(screen.getByLabelText("Senha provisória"), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText("Loja"), { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "Maria",
      email: "maria@loja.com",
      password: "secret1",
      storeId: "s2",
    });
  });

  it("cancela ao clicar em Cancelar", () => {
    const onCancel = vi.fn();
    render(
      <StaffForm stores={stores} allowManager onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
