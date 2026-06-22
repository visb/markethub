import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantContextDTO, MerchantStaffDTO } from "@markethub/api-client";

let ctx: { data?: MerchantContextDTO };
let staffResult: { data?: MerchantStaffDTO[]; isLoading: boolean };
let lastStoreFilter: string | undefined;
const createMutate = vi.fn();
const updateMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock("@/api/hooks/useMerchantContext", () => ({
  useMerchantContext: () => ctx,
}));
vi.mock("@/api/hooks/useStaff", () => ({
  useStaff: (storeId?: string) => {
    lastStoreFilter = storeId;
    return staffResult;
  },
  useCreateStaff: () => ({ mutate: createMutate, isPending: false }),
  useUpdateStaff: () => ({ mutate: updateMutate, isPending: false }),
  useRemoveStaff: () => ({ mutate: removeMutate, isPending: false }),
}));

import { Staff } from "./Staff";

const row = (over: Partial<MerchantStaffDTO> = {}): MerchantStaffDTO => ({
  id: "st1",
  staffRole: "picker",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  store: { id: "s1", name: "Loja A" },
  user: { id: "u9", name: "Picker", email: "p@loja.com", active: true },
  ...over,
});

const stores = [
  { id: "s1", name: "Loja A", merchantId: "m1" },
  { id: "s2", name: "Loja B", merchantId: "m1" },
];

describe("Staff (story 10)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    removeMutate.mockClear();
    lastStoreFilter = undefined;
    ctx = { data: { role: "owner", merchantId: "m1", stores } };
    staffResult = { data: [row()], isLoading: false };
  });

  it("mostra loading", () => {
    staffResult = { data: undefined, isLoading: true };
    render(<Staff />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio", () => {
    staffResult = { data: [], isLoading: false };
    render(<Staff />);
    expect(screen.getByText("Nenhum colaborador ainda.")).toBeInTheDocument();
  });

  it("lista colaboradores com papel, loja e e-mail; marca inativo", () => {
    staffResult = {
      data: [row(), row({ id: "st2", active: false, user: { id: "u8", name: "Drv", email: "d@loja.com", active: false } })],
      isLoading: false,
    };
    render(<Staff />);
    expect(screen.getByText("Picker")).toBeInTheDocument();
    expect(screen.getByText(/Separador · Loja A · p@loja.com/)).toBeInTheDocument();
    expect(screen.getByText("inativo")).toBeInTheDocument();
  });

  it("filtra por loja (passa storeId ao hook)", () => {
    render(<Staff />);
    expect(lastStoreFilter).toBeUndefined();
    fireEvent.change(screen.getByLabelText("Filtrar por loja"), { target: { value: "s2" } });
    expect(lastStoreFilter).toBe("s2");
  });

  it("owner vê ações sobre gerente; manager não vê", () => {
    staffResult = { data: [row({ staffRole: "manager" })], isLoading: false };
    render(<Staff />);
    expect(screen.getByRole("button", { name: "Excluir" })).toBeInTheDocument();
  });

  it("manager não gerencia gerente (sem ações na linha)", () => {
    ctx = { data: { role: "manager", merchantId: "m1", stores: [stores[0]] } };
    staffResult = { data: [row({ staffRole: "manager" })], isLoading: false };
    render(<Staff />);
    expect(screen.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("owner: remover chama removeStaff com hard=true", () => {
    render(<Staff />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(removeMutate).toHaveBeenCalledTimes(1);
    expect(removeMutate.mock.calls[0][0]).toMatchObject({ id: "st1", hard: true });
  });

  it("manager: remover desativa (hard=false)", () => {
    ctx = { data: { role: "manager", merchantId: "m1", stores: [stores[0]] } };
    render(<Staff />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(removeMutate.mock.calls[0][0]).toMatchObject({ id: "st1", hard: false });
  });

  it("alterna ativo via updateStaff", () => {
    render(<Staff />);
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "st1", patch: { active: false } });
  });

  it("abre o form de novo colaborador", () => {
    render(<Staff />);
    fireEvent.click(screen.getByRole("button", { name: "Novo colaborador" }));
    expect(screen.getByText("Novo colaborador")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cadastrar" })).toBeInTheDocument();
  });
});
