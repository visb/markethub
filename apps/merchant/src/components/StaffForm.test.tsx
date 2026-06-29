import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MerchantStoreDTO, StaffRoleName } from "@markethub/api-client";
import { StaffForm } from "./StaffForm";

const stores: MerchantStoreDTO[] = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

const ALL_ROLES: StaffRoleName[] = ["admin", "manager", "picker", "driver"];

describe("StaffForm (story 10 + RBAC story 16)", () => {
  it("oculta papéis fora de allowedRoles (gerente só picker/driver)", () => {
    render(
      <StaffForm
        stores={stores}
        allowedRoles={["picker", "driver"]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("option", { name: "Administrador" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Gerente" })).toBeNull();
    expect(screen.getByRole("option", { name: "Separador" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Entregador" })).toBeTruthy();
  });

  it("admin oferece Gerente mas NÃO Administrador", () => {
    render(
      <StaffForm
        stores={stores}
        allowedRoles={["manager", "picker", "driver"]}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("option", { name: "Gerente" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Administrador" })).toBeNull();
  });

  it("dono oferece o papel 'Administrador' (story 16)", () => {
    render(
      <StaffForm stores={stores} allowedRoles={ALL_ROLES} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("option", { name: "Administrador" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Gerente" })).toBeTruthy();
  });

  it("valida campos obrigatórios (zod) e não chama onSubmit", async () => {
    const onSubmit = vi.fn();
    render(
      <StaffForm stores={stores} allowedRoles={ALL_ROLES} onSubmit={onSubmit} onCancel={vi.fn()} />,
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
      <StaffForm stores={stores} allowedRoles={ALL_ROLES} onSubmit={onSubmit} onCancel={vi.fn()} />,
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
      <StaffForm stores={stores} allowedRoles={ALL_ROLES} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
