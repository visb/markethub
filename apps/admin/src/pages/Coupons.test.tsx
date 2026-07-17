import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CouponDTO } from "@markethub/api-client";

let couponsResult: { data?: CouponDTO[]; isLoading: boolean };
let lastFilter: string | undefined;
const createMutate = vi.fn();
const updateMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock("@/api/hooks/useCoupons", () => ({
  useCoupons: (filter?: string) => {
    lastFilter = filter;
    return couponsResult;
  },
  useCreateCoupon: () => ({ mutate: createMutate, isPending: false }),
  useUpdateCoupon: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteCoupon: () => ({ mutate: removeMutate, isPending: false }),
}));

vi.mock("@/api/hooks/useMerchantOptions", () => ({
  useMerchantOptions: () => ({
    data: [
      { id: "m1", name: "Rede A" },
      { id: "m2", name: "Rede B" },
    ],
  }),
}));

import { Coupons } from "./Coupons";

const row = (over: Partial<CouponDTO> = {}): CouponDTO => ({
  id: "c1",
  code: "GLOBAL10",
  title: null,
  description: null,
  type: "percent",
  value: 10,
  merchantId: null,
  merchantName: null,
  minOrderCents: null,
  validFrom: null,
  validTo: null,
  maxUses: null,
  usedCount: 0,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("Coupons admin (story 53)", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
    removeMutate.mockClear();
    lastFilter = undefined;
    couponsResult = { data: [row()], isLoading: false };
  });

  it("lista cupons com coluna de rede (Global) e valor", () => {
    couponsResult = {
      data: [row(), row({ id: "c2", code: "REDE5", merchantId: "m1", merchantName: "Rede A" })],
      isLoading: false,
    };
    render(<Coupons />);
    expect(screen.getByText("GLOBAL10")).toBeInTheDocument();
    expect(screen.getByText("REDE5")).toBeInTheDocument();
    // badge "Global" da linha do cupom global (único; o filtro usa "Somente globais")
    expect(screen.getByText("Global")).toBeInTheDocument();
    // "Rede A" aparece na opção do filtro e na célula da linha
    expect(screen.getAllByText("Rede A").length).toBeGreaterThanOrEqual(2);
  });

  it("estado vazio", () => {
    couponsResult = { data: [], isLoading: false };
    render(<Coupons />);
    expect(screen.getByText("Nenhum cupom.")).toBeInTheDocument();
  });

  it("filtro por rede repassa o merchantId ao hook", () => {
    render(<Coupons />);
    fireEvent.change(screen.getByLabelText("Filtrar por rede"), { target: { value: "m2" } });
    expect(lastFilter).toBe("m2");
  });

  it("filtro 'Somente globais' repassa 'global'", () => {
    render(<Coupons />);
    fireEvent.change(screen.getByLabelText("Filtrar por rede"), { target: { value: "global" } });
    expect(lastFilter).toBe("global");
  });

  it("cria cupom global válido dispara a mutation (merchantId null)", async () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "+ Novo cupom" }));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "natal5" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Natal 5%" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar cupom" }));
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      code: "NATAL5",
      title: "Natal 5%",
      type: "percent",
      value: 5,
      merchantId: null,
    });
  });

  it("cria cupom atrelado a uma rede quando selecionada", async () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "+ Novo cupom" }));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "rede9" } });
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Rede 9%" } });
    fireEvent.change(screen.getByLabelText("Rede"), { target: { value: "m1" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar cupom" }));
    await vi.waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({ merchantId: "m1" });
  });

  it("percentual fora da faixa bloqueia o submit", async () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "+ Novo cupom" }));
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: "bad" } });
    fireEvent.change(screen.getByLabelText("Percentual (%)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar cupom" }));
    await screen.findByText("Percentual entre 1 e 100");
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("alterna ativo via updateCoupon", () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ id: "c1", patch: { active: false } });
  });

  it("excluir chama removeCoupon com o id", () => {
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    expect(removeMutate.mock.calls[0][0]).toBe("c1");
  });

  it("editar trava código e rede e salva via updateCoupon (título/descrição no patch)", async () => {
    couponsResult = { data: [row({ title: "Bem-vindo", description: "10% off" })], isLoading: false };
    render(<Coupons />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar cupom")).toBeInTheDocument();
    expect((screen.getByLabelText(/Código/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Rede") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Título") as HTMLInputElement).value).toBe("Bem-vindo");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      id: "c1",
      patch: { title: "Bem-vindo", description: "10% off" },
    });
  });

  it("lista mostra title como principal e code secundário; fallback p/ code quando title null (story 73)", () => {
    couponsResult = {
      data: [
        row({ id: "c1", code: "BEMVINDO", title: "Bem-vindo", description: "Ganhe 10%" }),
        row({ id: "c2", code: "LEGADO", title: null }),
      ],
      isLoading: false,
    };
    render(<Coupons />);
    expect(screen.getByText("Bem-vindo")).toBeInTheDocument();
    expect(screen.getByText("BEMVINDO")).toBeInTheDocument();
    expect(screen.getByText("Ganhe 10%")).toBeInTheDocument();
    // cupom legado sem título mostra o código como principal (fallback)
    expect(screen.getByText("LEGADO")).toBeInTheDocument();
  });
});
