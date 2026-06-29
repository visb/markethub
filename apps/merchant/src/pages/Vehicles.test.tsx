import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VehicleDTO } from "@markethub/api-client";

let vehiclesResult: { data?: VehicleDTO[]; isLoading: boolean };
const createMutate = vi.fn();
const updateMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock("@/api/hooks/useVehicles", () => ({
  useVehicles: () => vehiclesResult,
  useCreateVehicle: () => ({ mutate: createMutate, isPending: false }),
  useUpdateVehicle: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteVehicle: () => ({ mutate: removeMutate, isPending: false }),
}));

import { Vehicles } from "./Vehicles";

const row = (over: Partial<VehicleDTO> = {}): VehicleDTO => ({
  id: "v1",
  merchantId: "m1",
  plate: "ABC1D23",
  type: "car",
  description: "Fiorino branca",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("Vehicles (story 14)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    removeMutate.mockClear();
    vehiclesResult = { data: [row()], isLoading: false };
  });

  it("mostra loading", () => {
    vehiclesResult = { data: undefined, isLoading: true };
    render(<Vehicles />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio", () => {
    vehiclesResult = { data: [], isLoading: false };
    render(<Vehicles />);
    expect(screen.getByText("Nenhum veículo ainda.")).toBeInTheDocument();
  });

  it("lista veículos com placa, tipo e descrição; marca inativo", () => {
    vehiclesResult = {
      data: [row(), row({ id: "v2", plate: "ZZZ9Z99", active: false, type: "van", description: null })],
      isLoading: false,
    };
    render(<Vehicles />);
    expect(screen.getByText("ABC1D23")).toBeInTheDocument();
    expect(screen.getByText(/Carro · Fiorino branca/)).toBeInTheDocument();
    expect(screen.getByText("inativo")).toBeInTheDocument();
  });

  it("abre o form de novo veículo e o submit dispara a mutation", async () => {
    render(<Vehicles />);
    fireEvent.click(screen.getByRole("button", { name: "Novo veículo" }));
    expect(screen.getByText("Novo veículo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Placa"), { target: { value: "ABC1D23" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    // o submit válido (zod) dispara a mutation de criação
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({ plate: "ABC1D23", type: "motorcycle" });
  });

  it("alterna ativo via updateVehicle", () => {
    render(<Vehicles />);
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "v1", patch: { active: false } });
  });

  it("excluir chama removeVehicle com hard=true", () => {
    render(<Vehicles />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(removeMutate).toHaveBeenCalledTimes(1);
    expect(removeMutate.mock.calls[0][0]).toMatchObject({ id: "v1", hard: true });
  });

  it("editar abre o form preenchido e salva via updateVehicle", async () => {
    render(<Vehicles />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar veículo")).toBeInTheDocument();
    expect((screen.getByLabelText("Placa") as HTMLInputElement).value).toBe("ABC1D23");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "v1" });
  });
});
