import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CouponDTO } from "@markethub/api-client";

let couponsResult: { data?: CouponDTO[]; isLoading: boolean };
const createMutate = vi.fn();
const updateMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock("@/api/hooks/useCoupons", () => ({
  useCoupons: () => couponsResult,
  useCreateCoupon: () => ({ mutate: createMutate, isPending: false }),
  useUpdateCoupon: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteCoupon: () => ({ mutate: removeMutate, isPending: false }),
}));

import { Coupons } from "./Coupons";

const row = (over: Partial<CouponDTO> = {}): CouponDTO => ({
  id: "c1",
  code: "BLACK10",
  type: "percent",
  value: 10,
  merchantId: "m1",
  merchantName: "Rede A",
  minOrderCents: null,
  validFrom: null,
  validTo: null,
  maxUses: 100,
  usedCount: 3,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("Coupons (story 53)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    removeMutate.mockClear();
    couponsResult = { data: [row()], isLoading: false };
  });

  it("mostra loading", () => {
    couponsResult = { data: undefined, isLoading: true };
    render(<Coupons />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("estado vazio", () => {
    couponsResult = { data: [], isLoading: false };
    render(<Coupons />);
    expect(screen.getByText("Nenhum cupom ainda.")).toBeInTheDocument();
  });

  it("lista cupons com código, valor percentual, usos/limite e status", () => {
    couponsResult = {
      data: [
        row(),
        row({
          id: "c2",
          code: "FRETE",
          type: "free_shipping",
          value: 0,
          active: false,
          usedCount: 0,
          maxUses: null,
        }),
      ],
      isLoading: false,
    };
    render(<Coupons />);
    expect(screen.getByText("BLACK10")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("3/100")).toBeInTheDocument();
    expect(screen.getByText("Frete grátis")).toBeInTheDocument();
    expect(screen.getByText("inativo")).toBeInTheDocument();
  });

  it("cria cupom válido dispara a mutation com payload normalizado", async () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Novo cupom" }));
    expect(screen.getByText("Novo cupom")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "verao20" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      code: "VERAO20",
      type: "percent",
      value: 20,
    });
  });

  it("percentual fora da faixa bloqueia o submit (validação zod)", async () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Novo cupom" }));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "bad" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await screen.findByText("Percentual entre 1 e 100");
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("alterna ativo via updateCoupon", () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "c1", patch: { active: false } });
  });

  it("excluir chama removeCoupon com o id", () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(removeMutate).toHaveBeenCalledTimes(1);
    expect(removeMutate.mock.calls[0][0]).toBe("c1");
  });

  it("cupom fixo com validade formata valor em R$ e janela de datas", () => {
    couponsResult = {
      data: [
        row({
          type: "fixed",
          value: 1500,
          validFrom: "2026-01-01T00:00:00.000Z",
          validTo: "2026-02-01T00:00:00.000Z",
        }),
      ],
      isLoading: false,
    };
    render(<Coupons />);
    expect(screen.getByText("R$ 15,00")).toBeInTheDocument();
    // janela renderiza duas datas separadas por travessão
    expect(screen.getByText(/–/)).toBeInTheDocument();
  });

  it("erro ao excluir cupom usado mostra mensagem (via onError)", async () => {
    const { ApiClientError } = await import("@markethub/api-client");
    removeMutate.mockImplementation((_id: string, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new ApiClientError(400, { code: "COUPON_IN_USE", message: "Cupom já foi utilizado" }));
    });
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Cupom já foi utilizado");
  });

  it("editar abre o form com código travado e salva via updateCoupon", async () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar cupom")).toBeInTheDocument();
    expect((screen.getByLabelText(/Código/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "c1" });
  });
});
